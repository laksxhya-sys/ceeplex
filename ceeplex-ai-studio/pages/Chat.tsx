import React, { useState, useRef, useEffect } from 'react';
import { 
  Send, Image as ImageIcon, Trash2, StopCircle, RefreshCw, 
  Paperclip, X, Plus, MessageSquare, Menu, Wand2, MoreHorizontal, 
  ChevronLeft, WifiOff, Database, Headphones, Mic, MicOff, PanelLeftClose, PanelLeftOpen,
  MoreVertical, Info, User as UserIcon
} from 'lucide-react';
import { streamChatResponse, generateImageInChat } from '../services/geminiService';
import { compressImage } from '../services/imageUtils';
import { LiveService } from '../services/liveService';
import { ChatMessage, ChatSession, UserRole } from '../types';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { 
  collection, addDoc, query, where, orderBy, onSnapshot, 
  serverTimestamp, doc, updateDoc, deleteDoc, setDoc, getDoc
} from 'firebase/firestore';

export const Chat = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{file: File, preview: string} | null>(null);
  const [imageSize, setImageSize] = useState<'1K' | '2K' | '4K'>('1K');
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  
  // Initialize sidebar closed on mobile, open on desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 768);
  
  const [dbError, setDbError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  
  const [isImageMode, setIsImageMode] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [isLiveConnected, setIsLiveConnected] = useState(false);
  const [audioVolume, setAudioVolume] = useState(0);
  const liveServiceRef = useRef<LiveService | null>(null);

  // Creator/Info Modal State
  const [showInfo, setShowInfo] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isGuest = user?.role === UserRole.GUEST;
  const getLocalDataKey = () => `ceeplex_chats_${user?.email || 'guest'}`;

  const loadLocalChats = (): ChatSession[] => {
    try {
        const saved = localStorage.getItem(getLocalDataKey());
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        return [];
    }
  };

  const saveLocalChats = (updatedChats: ChatSession[]) => {
      try { localStorage.setItem(getLocalDataKey(), JSON.stringify(updatedChats)); } catch (e) {}
  };

  // Init/Load Chats
  useEffect(() => {
    if (!user) return;
    
    if (isGuest) {
        setIsOffline(true);
        const local = loadLocalChats();
        if (local.length > 0) {
            setChats(local);
        } else {
             const newChat = { id: 'guest-' + Date.now(), title: 'New Chat', messages: [], updatedAt: Date.now() };
             setChats([newChat]);
             setCurrentChatId(newChat.id);
             saveLocalChats([newChat]);
        }
        return;
    }
    
    setDbError(null);
    let unsubscribe: () => void;

    try {
      const q = query(
        collection(db, 'chats'), 
        where('userEmail', '==', user.email),
        orderBy('updatedAt', 'desc')
      );

      unsubscribe = onSnapshot(q, 
        (snapshot) => {
          setIsOffline(false);
          setDbError(null);
          const loadedChats = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            messages: [] 
          })) as ChatSession[];
          setChats(loadedChats);
        },
        (error) => {
          setIsOffline(true);
          const local = loadLocalChats();
          setChats(local.length > 0 ? local : [{ id: 'local-' + Date.now(), title: 'New Chat (Local)', messages: [], updatedAt: Date.now() }]);
          
          if (!currentChatId) {
             setCurrentChatId(local.length > 0 ? local[0].id : ('local-' + Date.now()));
          }

          if (error.code === 'permission-denied' || error.message.includes("Cloud Firestore API")) {
            setDbError(null); 
          } else {
            setDbError("Connection failed. Using local storage.");
          }
        }
      );
    } catch (e) {
      setIsOffline(true);
      const local = loadLocalChats();
      setChats(local);
    }

    return () => { if (unsubscribe) unsubscribe(); };
  }, [user]);

  // Load Messages
  useEffect(() => {
    if (!currentChatId) { setMessages([]); return; }

    if (isOffline || isGuest) {
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) setMessages(chat.messages || []);
        else setMessages([]);
        return;
    }

    try {
      const q = query(collection(db, 'chats', currentChatId, 'messages'), orderBy('timestamp', 'asc'));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ChatMessage[]);
      }, () => setIsOffline(true));
      return () => unsubscribe();
    } catch (e) { setIsOffline(true); }
  }, [currentChatId, isOffline, isGuest, chats]); 

  const scrollToBottom = () => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  useEffect(() => {
    scrollToBottom();
    const timeout = setTimeout(scrollToBottom, 150);
    return () => clearTimeout(timeout);
  }, [messages.length, isLoading]);

  const toggleLiveMode = async () => {
    if (isLiveMode) {
        if (liveServiceRef.current) {
            await liveServiceRef.current.disconnect();
            liveServiceRef.current = null;
        }
        setIsLiveMode(false);
        setIsLiveConnected(false);
    } else {
        setIsLiveMode(true);
        try {
            const service = new LiveService();
            liveServiceRef.current = service;
            await service.connect((vol) => setAudioVolume(vol));
            setIsLiveConnected(true);
        } catch (e) {
            console.error("Failed to start live mode", e);
            alert("Could not start Live Voice mode. Please check microphone permissions.");
            setIsLiveMode(false);
        }
    }
  };

  const updateLocalChat = (chatId: string, newMessages: ChatMessage[], title?: string) => {
      setChats(prev => {
          const chatExists = prev.some(c => c.id === chatId);
          let updatedChats;
          if (chatExists) {
              updatedChats = prev.map(c => c.id === chatId ? { ...c, messages: newMessages, title: title || c.title, updatedAt: Date.now() } : c);
          } else {
               const newChat: ChatSession = { id: chatId, title: title || 'New Chat', messages: newMessages, updatedAt: Date.now() };
               updatedChats = [newChat, ...prev];
          }
          const chat = updatedChats.find(c => c.id === chatId);
          const others = updatedChats.filter(c => c.id !== chatId);
          const result = chat ? [chat, ...others] : others;
          saveLocalChats(result);
          return result;
      });
  };

  const createNewChat = async () => {
    const newId = (isOffline || isGuest ? 'local-' : '') + Date.now();
    setMessages([]); setInput(''); setCurrentChatId(newId);
    if (isOffline || isGuest) {
        const newChat: ChatSession = { id: newId, title: 'New Chat', messages: [], updatedAt: Date.now() };
        const newChats = [newChat, ...chats];
        setChats(newChats);
        saveLocalChats(newChats);
    }
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (isOffline || isGuest) {
        const newChats = chats.filter(c => c.id !== chatId);
        setChats(newChats);
        saveLocalChats(newChats);
        if (currentChatId === chatId) { setCurrentChatId(null); setMessages([]); }
        return;
    }
    if (window.confirm("Delete this chat?")) {
      try {
        await deleteDoc(doc(db, 'chats', chatId));
        if (currentChatId === chatId) createNewChat();
      } catch (err) { /* ignore */ }
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => { if (ev.target?.result) setSelectedImage({ file, preview: ev.target.result as string }); };
      reader.readAsDataURL(file);
    }
  };

  const clearImage = () => { setSelectedImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; };

  const handleSend = async () => {
    if ((!input.trim() && !selectedImage) || isLoading) return;
    setIsLoading(true);
    const currentInput = input;
    const currentImage = selectedImage;
    const lowerInput = currentInput.toLowerCase();
    
    const isImageGeneration = isImageMode || (lowerInput.startsWith('generate image') || lowerInput.startsWith('create image') || lowerInput.startsWith('draw'));

    const tempUserMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: currentInput, image: currentImage?.preview, timestamp: Date.now() };
    const updatedMessages = [...messages, tempUserMsg];
    setMessages(updatedMessages);
    setInput(''); clearImage();
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    let chatId = currentChatId;
    if (!chatId) {
        chatId = (isOffline || isGuest ? 'local-' : '') + Date.now();
        setCurrentChatId(chatId);
        
        const title = currentInput.length > 30 ? currentInput.substring(0, 30) + '...' : currentInput;
        const newChat: ChatSession = { id: chatId, title, messages: [tempUserMsg], updatedAt: Date.now() };
        if (isOffline || isGuest) {
             setChats(prev => [newChat, ...prev]);
             saveLocalChats([newChat, ...chats]);
        }
    } else if (isOffline || isGuest) updateLocalChat(chatId, updatedMessages);

    if (!isOffline && !isGuest && chatId) {
        try {
            // Check if chat exists first to avoid overwriting or creating generic ones
            const chatRef = doc(db, 'chats', chatId);
            const chatSnap = await getDoc(chatRef);
            
            if (!chatSnap.exists()) {
               await setDoc(chatRef, { 
                 userEmail: user?.email, 
                 title: currentInput.substring(0,30), 
                 updatedAt: serverTimestamp() 
               });
            } else {
               await updateDoc(chatRef, { updatedAt: serverTimestamp() });
            }

            await addDoc(collection(db, 'chats', chatId, 'messages'), { role: 'user', text: currentInput, image: currentImage?.preview || null, timestamp: Date.now() });
        } catch (error) { setIsOffline(true); updateLocalChat(chatId, updatedMessages); }
    }

    if (isImageGeneration) {
        try {
            const loadingMsgId = (Date.now() + 1).toString();
            const loadingMsg: ChatMessage = { id: loadingMsgId, role: 'model', text: '🎨 Generating...', timestamp: Date.now() };
            const messagesWithLoading = [...updatedMessages, loadingMsg];
            setMessages(messagesWithLoading);

            let base64 = currentImage ? currentImage.preview.split(',')[1] : undefined;
            const imageUrl = await generateImageInChat(currentInput, base64, currentImage?.file.type, { size: imageSize });
            
            const finalMessages = messagesWithLoading.filter(m => m.id !== loadingMsgId);
            const modelMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: `Here is the image for: "${currentInput}"`, image: imageUrl, timestamp: Date.now() };
            finalMessages.push(modelMsg);
            setMessages(finalMessages);

            if (isOffline || isGuest) updateLocalChat(chatId!, finalMessages);
            else {
                await addDoc(collection(db, 'chats', chatId!, 'messages'), modelMsg);
                if (imageUrl.startsWith('data:')) {
                    await addDoc(collection(db, 'generated_images'), {
                        userEmail: user?.email,
                        prompt: currentInput,
                        imageUrl: imageUrl, 
                        timestamp: Date.now()
                    });
                }
            }
        } catch (error: any) {
            const errorMsg: ChatMessage = { id: Date.now().toString(), role: 'model', text: error.message || "Error generating image", timestamp: Date.now() };
            setMessages(prev => {
                const res = [...prev.filter(m => !m.text.includes('Generating')), errorMsg];
                if (isOffline || isGuest) updateLocalChat(chatId!, res);
                return res;
            });
        } finally { setIsLoading(false); }
        return;
    }

    const modelMsgId = (Date.now() + 1).toString();
    const modelMsgPlaceholder: ChatMessage = { id: modelMsgId, role: 'model', text: '', timestamp: Date.now() };
    let currentMessagesWithPlaceholder = [...updatedMessages, modelMsgPlaceholder];
    setMessages(currentMessagesWithPlaceholder);
    let fullResponse = "";

    try {
        const history = updatedMessages.slice(-10).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        let base64 = currentImage ? currentImage.preview.split(',')[1] : undefined;
        const stream = await streamChatResponse(history, currentInput, base64, currentImage?.file.type);
        
        for await (const chunk of stream) {
            fullResponse += chunk;
            setMessages(prev => {
                const newMsg = [...prev];
                const msgIndex = newMsg.findIndex(m => m.id === modelMsgId);
                if (msgIndex !== -1) newMsg[msgIndex] = { ...newMsg[msgIndex], text: fullResponse };
                return newMsg;
            });
            scrollToBottom();
        }

        if (isOffline || isGuest) {
            updateLocalChat(chatId!, currentMessagesWithPlaceholder.map(m => m.id === modelMsgId ? { ...m, text: fullResponse } : m));
        } else {
            try { await addDoc(collection(db, 'chats', chatId!, 'messages'), { role: 'model', text: fullResponse, timestamp: Date.now() }); }
            catch(e) { updateLocalChat(chatId!, currentMessagesWithPlaceholder.map(m => m.id === modelMsgId ? { ...m, text: fullResponse } : m)); }
        }
    } catch (error: any) {
        setMessages(prev => {
            const newMsg = [...prev];
            const msgIndex = newMsg.findIndex(m => m.id === modelMsgId);
            if (msgIndex !== -1) newMsg[msgIndex] = { ...newMsg[msgIndex], text: error.message };
            if (isOffline || isGuest) updateLocalChat(chatId!, newMsg);
            return newMsg;
        });
    } finally { setIsLoading(false); }
  };

  return (
    <div className="flex h-[calc(100vh-100px)] md:h-[calc(100vh-110px)] md:-mt-8 overflow-hidden bg-transparent text-slate-100 relative font-sans">
      
      {/* Live Mode Overlay */}
      {isLiveMode && (
          <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center animate-fade-in">
              <button onClick={toggleLiveMode} className="absolute top-6 right-6 p-4 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/5 z-50 shadow-lg">
                <X size={24} />
              </button>

              <div className="flex flex-col items-center gap-10 w-full max-w-md px-6 relative z-10">
                  
                  {/* Header */}
                  <div className="text-center space-y-3">
                     <h2 className="text-4xl font-serif font-medium text-white tracking-tight drop-shadow-lg">Ceeplex Live</h2>
                     <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
                        <span className={`w-2 h-2 rounded-full ${isLiveConnected ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`}></span>
                        <span className="text-slate-300 text-xs font-bold uppercase tracking-widest">{isLiveConnected ? "Listening" : "Connecting..."}</span>
                     </div>
                  </div>

                  {/* Roundy Visualizer with Logo */}
                  <div className="relative flex items-center justify-center h-80 w-full">
                      {isLiveConnected ? (
                          <>
                            {/* Ambient Rings */}
                            <div className="absolute w-[300px] h-[300px] rounded-full border border-white/5 animate-[spin_12s_linear_infinite]" />
                            <div className="absolute w-[240px] h-[240px] rounded-full border border-white/5 animate-[spin_15s_linear_infinite_reverse]" />
                            
                            {/* Volume Glow */}
                            <div 
                                className="absolute rounded-full bg-white/10 blur-3xl transition-all duration-100"
                                style={{ 
                                    width: `${160 + audioVolume * 150}px`, 
                                    height: `${160 + audioVolume * 150}px`,
                                    opacity: Math.min(0.2 + audioVolume, 0.5)
                                }} 
                            />

                            {/* Main Center Circle */}
                            <div 
                                className="relative w-44 h-44 rounded-full bg-black/40 backdrop-blur-xl border border-white/10 flex items-center justify-center shadow-[0_0_40px_rgba(0,0,0,0.5)] transition-all duration-100 ease-out"
                                style={{ transform: `scale(${1 + Math.max(0, audioVolume * 0.15)})` }}
                            >
                                {/* Inner Rim */}
                                <div className="absolute inset-0 rounded-full border border-white/20 shadow-inner"></div>
                                
                                {/* Logo */}
                                <img 
                                  src="https://iili.io/fpcnLLQ.png" 
                                  alt="Ceeplex" 
                                  className="w-24 h-24 object-contain drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]" 
                                />
                            </div>
                          </>
                      ) : (
                          <div className="relative w-20 h-20">
                             <div className="absolute inset-0 rounded-full border-2 border-white/20"></div>
                             <div className="absolute inset-0 rounded-full border-2 border-t-white animate-spin"></div>
                          </div>
                      )}
                  </div>

                  {/* Footer Text */}
                  <div className="text-slate-500 text-sm font-medium text-center max-w-xs leading-relaxed">
                    {isLiveConnected ? "Speak naturally. Ceeplex is listening to your voice." : "Establishing secure audio connection..."}
                  </div>

                  {/* Footer Controls */}
                  <button 
                    onClick={toggleLiveMode} 
                    className="p-5 rounded-full bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all border border-red-500/20 shadow-lg hover:shadow-red-500/30 group"
                  >
                    <MicOff size={24} className="group-hover:scale-110 transition-transform"/>
                  </button>
              </div>
          </div>
      )}

      {/* Info Modal */}
      {showInfo && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in" onClick={() => setShowInfo(false)}>
            <div className="bg-black/80 border border-white/20 p-6 rounded-2xl max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">Ceeplex AI</h3>
                    <button onClick={() => setShowInfo(false)}><X size={20} className="text-slate-400 hover:text-white"/></button>
                </div>
                <p className="text-sm text-slate-300 mb-4 leading-relaxed">
                    Ceeplex is your personal creative engine, powered by advanced AI to help you chat, create images, and explore templates.
                </p>
                <div className="text-xs text-slate-500 uppercase tracking-widest font-bold border-t border-white/10 pt-4">
                    Created by Lakshya Baradiya
                </div>
            </div>
        </div>
      )}

      {/* Sidebar Overlay for Mobile */}
      <div className={`fixed inset-0 z-50 md:static md:z-auto transition-all duration-300 ${isSidebarOpen ? 'visible' : 'invisible md:visible'}`}>
         {/* Backdrop for mobile */}
         <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm md:hidden transition-opacity duration-300 ${isSidebarOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setIsSidebarOpen(false)} />
         
         {/* Sidebar Content */}
         <div className={`absolute md:relative inset-y-0 left-0 w-[280px] h-full bg-black/60 backdrop-blur-xl border-r border-white/10 flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:border-none md:overflow-hidden'}`}>
             
             {/* Sidebar Header (Mobile) */}
             <div className="flex items-center justify-between p-4 md:hidden border-b border-white/5 bg-black/20">
                <span className="font-serif font-bold text-white tracking-wide">History</span>
                <button onClick={() => setIsSidebarOpen(false)} className="p-2 bg-white/5 rounded-full text-slate-400 hover:text-white hover:bg-white/20 transition-all shadow-lg border border-white/5">
                    <X size={18} />
                </button>
             </div>

             {/* Sidebar Desktop Header (Hidden on mobile) */}
             <div className="hidden md:flex items-center justify-between p-4 border-b border-white/5 bg-transparent">
                 <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">History</span>
                 {isSidebarOpen && (
                     <button onClick={() => setIsSidebarOpen(false)} className="text-slate-500 hover:text-white transition-colors" title="Close Sidebar">
                         <PanelLeftClose size={18} />
                     </button>
                 )}
             </div>

             <div className="p-4 space-y-4">
                 <button onClick={createNewChat} className="w-full flex items-center gap-2 px-4 py-3 bg-white text-black hover:bg-gray-200 border border-white/10 rounded-xl transition-all text-sm font-bold shadow-sm font-sans">
                     <Plus size={18} className="text-black" /> New Chat
                 </button>
                 
                 {(isGuest || isOffline) && (
                     <div className="relative overflow-hidden rounded-xl bg-black/60 border border-white/10 p-4 shadow-lg">
                         <div className="flex items-start gap-3 relative z-10">
                             {isGuest ? <Database size={16} className="text-white mt-1" /> : <WifiOff size={16} className="text-white mt-1" />}
                             <div>
                                 <h4 className="text-sm font-bold text-white">{isGuest ? 'Guest Mode' : 'Local Mode'}</h4>
                                 <p className="text-[10px] text-gray-400 mt-1 leading-tight">{isGuest ? 'Chats saved to device.' : 'Database unavailable. Using local storage.'}</p>
                             </div>
                         </div>
                     </div>
                 )}
                 {dbError && !isGuest && <div className="px-4 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-[10px] text-red-300">{dbError}</div>}
             </div>
             
             <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-thin scrollbar-thumb-white/10">
               <div className="space-y-1">
                 {chats.map(chat => (
                   <div key={chat.id} onClick={() => { setCurrentChatId(chat.id); if (window.innerWidth < 768) setIsSidebarOpen(false); }} className={`group relative flex items-center gap-3 px-3 py-3 rounded-lg cursor-pointer transition-colors text-sm font-sans ${currentChatId === chat.id ? 'bg-white/10 text-white border border-white/10' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}>
                     <span className="truncate flex-1 pr-6">{chat.title || 'New Chat'}</span>
                     <button onClick={(e) => deleteChat(e, chat.id)} className={`absolute right-2 p-1.5 rounded-md hover:bg-red-500/20 hover:text-red-400 transition-all ${currentChatId === chat.id ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}><Trash2 size={14} /></button>
                   </div>
                 ))}
               </div>
             </div>
         </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative w-full h-full min-w-0 md:pl-2">
        
        <div className="bg-black/20 backdrop-blur-xl w-full h-full md:rounded-[2rem] border-x border-b md:border border-white/10 shadow-2xl overflow-hidden flex flex-col relative">
            
            {/* Chat Header Bar */}
            <div className="absolute top-0 left-0 right-0 h-16 bg-black/40 backdrop-blur-md border-b border-white/5 z-20 flex items-center justify-between px-4 md:px-6">
                <div className="flex items-center gap-3">
                    
                    {/* Mobile Menu Trigger */}
                    <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white transition-colors">
                        <Menu size={20} />
                    </button>
                    
                    {/* Desktop Open Sidebar Trigger */}
                    {!isSidebarOpen && (
                       <button onClick={() => setIsSidebarOpen(true)} className="hidden md:block p-2 -ml-2 text-slate-400 hover:text-white transition-colors" title="Open Sidebar">
                           <PanelLeftOpen size={20} />
                       </button>
                    )}

                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center p-1.5 border border-white/10">
                            <img src="https://iili.io/fpcnLLQ.png" alt="Bot" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold text-white font-serif tracking-wide leading-none">Ceeplex AI</h2>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_5px_#22c55e]"></span>
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Online</span>
                            </div>
                        </div>
                    </div>
                </div>
                <button onClick={() => setShowInfo(true)} className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                    <MoreVertical size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 pt-20 scroll-smooth pb-36 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                {messages.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-0 animate-fade-in" style={{animationFillMode: 'forwards'}}>
                        <div className="mb-6 relative"><div className="absolute inset-0 bg-white/10 blur-3xl rounded-full"></div><img src="https://iili.io/fpcnLLQ.png" alt="Ceeplex" className="w-20 h-20 object-contain relative z-10 drop-shadow-2xl" /></div>
                        <h2 className="text-3xl font-bold text-white mb-2 font-serif">Ceeplex Intelligence</h2>
                        <p className="text-slate-400 mb-8 max-w-sm">Your personal creative engine. Ask questions, generate art, or use templates.</p>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-xl text-left">
                            <SuggestionCard text="Translate 'Hello' to..." onClick={() => setInput("Translate 'Hello' to Spanish, French and Japanese")} />
                            <SuggestionCard text="How to code a navbar" onClick={() => setInput("Show me how to code a responsive navbar in React and Tailwind")} />
                            <SuggestionCard text="Generate futuristic art" onClick={() => { setIsImageMode(true); setInput("Generate image of a futuristic neon city"); }} />
                        </div>
                    </div>
                )}
                
                {/* Messages Rendering */}
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'} mb-6`}>
                        <div className={`flex gap-4 max-w-[90%] md:max-w-[75%] ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            
                            {/* Model Avatar */}
                            {msg.role === 'model' && (
                                <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/10 flex-shrink-0 shadow-lg mt-auto">
                                    <img src="https://iili.io/fpcnLLQ.png" className="w-6 h-6 object-contain" />
                                </div>
                            )}

                            {/* Message Bubble - Rounded Glass Blur Box */}
                            <div className={`
                                relative px-6 py-4 shadow-2xl backdrop-blur-2xl border transition-all duration-300
                                ${msg.role === 'user' 
                                    ? 'bg-white/10 border-white/20 text-white rounded-[2rem] rounded-tr-sm' 
                                    : 'bg-black/40 border-white/10 text-slate-100 rounded-[2rem] rounded-tl-sm'
                                }
                            `}>
                                {msg.image && (
                                    <div className="mb-4 rounded-xl overflow-hidden bg-black/20 border border-white/5">
                                        <img src={msg.image} className="max-w-full h-auto" onLoad={scrollToBottom} />
                                    </div>
                                )}
                                <div className="whitespace-pre-wrap break-words min-w-0 text-[15px] leading-relaxed font-sans font-light">
                                    {msg.text}
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {isLoading && (
                    <div className="flex w-full justify-start mb-6">
                        <div className="flex gap-4 max-w-[75%]">
                            <div className="w-10 h-10 rounded-full bg-black/40 flex items-center justify-center border border-white/10 flex-shrink-0 mt-auto">
                                <img src="https://iili.io/fpcnLLQ.png" className="w-6 h-6 object-contain" />
                            </div>
                            <div className="bg-black/40 backdrop-blur-2xl border border-white/10 px-6 py-5 rounded-[2rem] rounded-tl-sm flex items-center gap-2">
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-75"></div>
                                <div className="w-2 h-2 bg-white rounded-full animate-bounce delay-150"></div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div ref={messagesEndRef} />
            </div>

            <div className="absolute bottom-0 left-0 right-0 z-20 p-4 md:p-6 bg-gradient-to-t from-black/80 via-black/60 to-transparent pt-12">
                {selectedImage && (<div className="absolute top-[-70px] left-6 p-2 bg-black border border-white/10 rounded-xl flex items-center gap-3 animate-slide-up shadow-xl z-30"><img src={selectedImage.preview} alt="Preview" className="w-12 h-12 object-cover rounded-lg" /><button onClick={clearImage} className="bg-white/10 text-white rounded-full p-1 hover:bg-white/30 transition-colors"><X size={14} /></button></div>)}
                <div className="max-w-4xl mx-auto bg-black/60 backdrop-blur-xl border border-white/10 rounded-full p-2 pl-4 pr-2 flex items-center shadow-2xl relative">
                    <button onClick={() => fileInputRef.current?.click()} className="text-slate-400 hover:text-white p-2 hover:bg-white/5 rounded-full transition-colors"><Paperclip size={20} /></button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleImageSelect} />
                    <textarea ref={textareaRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder={isImageMode ? "Describe image..." : "Ask Ceeplex"} className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-slate-500 resize-none py-3 px-3 max-h-[140px] overflow-y-auto leading-relaxed scrollbar-hide font-sans text-base" rows={1} style={{minHeight: '48px'}} />
                    <div className="flex items-center gap-1">
                        <button onClick={() => setIsImageMode(!isImageMode)} className={`p-2 rounded-full transition-all duration-300 ${isImageMode ? 'text-white bg-white/20 shadow-[0_0_15px_rgba(255,255,255,0.3)]' : 'text-slate-400 hover:text-white hover:bg-white/5'}`} title="Toggle Image Generation Mode"><ImageIcon size={20} /></button>
                        <button onClick={toggleLiveMode} className="text-slate-400 hover:text-white p-2 hover:bg-white/10 rounded-full transition-colors" title="Live Voice Chat"><Headphones size={20} /></button>
                        <button onClick={handleSend} disabled={isLoading || (!input.trim() && !selectedImage)} className={`p-3 rounded-full transition-all duration-200 flex items-center justify-center ${(input.trim() || selectedImage) && !isLoading ? 'bg-white text-black hover:bg-gray-200 shadow-lg shadow-white/20' : 'bg-white/5 text-slate-500 cursor-not-allowed'}`}>{isLoading ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} className="ml-0.5" />}</button>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const SuggestionCard = ({text, onClick}: {text: string, onClick: () => void}) => (<button onClick={onClick} className="p-4 bg-black/40 hover:bg-white/10 border border-white/10 rounded-xl text-left text-sm text-slate-300 transition-colors w-full group font-sans"><span className="group-hover:text-white transition-colors">{text}</span></button>);