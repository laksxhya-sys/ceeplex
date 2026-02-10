import React, { useState, useEffect } from 'react';
import { Search, Heart, Sparkles, X, Download, Share2, Bell } from 'lucide-react';
import { generateImageFromTemplate } from '../services/geminiService';
import { compressImage } from '../services/imageUtils';
import { Template } from '../types';
import { collection, onSnapshot, query, orderBy, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';

const CategoryPill: React.FC<{ label: string, active: boolean, onClick: () => void }> = ({ label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all border ${
      active 
        ? 'bg-white text-black border-white shadow-[0_0_15px_rgba(255,255,255,0.3)]' 
        : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
    }`}
  >
    {label}
  </button>
);

export const Templates = () => {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [userImage, setUserImage] = useState<{file: File, preview: string} | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Templates from Real DB
  useEffect(() => {
    const q = query(collection(db, 'templates')); 
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Template));
        fetched.sort((a,b) => b.likes - a.likes); // Default sort
        setTemplates(fetched);
        setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const categories = ['All', 'Social Media', 'Marketing', 'Creative', 'Business', 'Personal'];

  const filteredTemplates = templates.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          t.category.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleTemplateClick = (template: Template) => {
    setSelectedTemplate(template);
    setUserImage(null);
    setGeneratedImage(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setUserImage({ file, preview: ev.target.result as string });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!selectedTemplate || !userImage) return;

    setIsGenerating(true);
    try {
      const base64 = userImage.preview.split(',')[1];
      const result = await generateImageFromTemplate(selectedTemplate.promptTemplate, base64, userImage.file.type);
      setGeneratedImage(result);

      if (user && result && !result.includes("Error")) {
          try {
              // Compress before saving to DB if large
              let imageToSave = result;
              if (result.length > 500000) {
                  imageToSave = await compressImage(result);
              }

              await addDoc(collection(db, 'generated_images'), {
                  userEmail: user.email,
                  prompt: `Template: ${selectedTemplate.title}`,
                  imageUrl: imageToSave,
                  timestamp: Date.now()
              });
          } catch(e) {
              console.error("Failed to save template image to profile", e);
          }
      }

    } catch (error) {
      console.error(error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const closeModal = () => {
    setSelectedTemplate(null);
    setUserImage(null);
    setGeneratedImage(null);
  };

  return (
    <div className="h-[calc(100vh-85px)] md:h-[calc(100vh-85px)] p-2 md:p-4 mt-[-20px] md:mt-0">
      <div className="bg-black/40 backdrop-blur-md w-full h-full rounded-[2rem] border border-white/10 shadow-2xl overflow-hidden flex flex-col relative">
      
        {/* Header Area */}
        <div className="pt-6 px-6 pb-4 bg-transparent sticky top-0 z-30">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-3xl font-bold text-white tracking-tight font-serif">Templates</h1>
            <button className="p-2 rounded-full bg-white/5 hover:bg-white/10 transition-colors relative">
              <Bell size={20} className="text-slate-300" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full border border-black"></span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-6">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
            <input 
              type="text" 
              placeholder="Search AI templates..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30 transition-all font-sans"
            />
          </div>

          {/* Categories */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            {categories.map(cat => (
              <CategoryPill 
                key={cat} 
                label={cat} 
                active={selectedCategory === cat} 
                onClick={() => setSelectedCategory(cat)} 
              />
            ))}
          </div>
        </div>

        {/* Main Grid Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth pb-32">
          {isLoading && <div className="text-center text-slate-500 py-20 font-sans">Loading amazing templates...</div>}

          {!isLoading && filteredTemplates.length === 0 && (
             <div className="text-center text-slate-500 py-20 border border-white/5 rounded-3xl border-dashed bg-white/5">
                <Sparkles size={32} className="mx-auto mb-3 opacity-50"/>
                <p>No templates found.</p>
             </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredTemplates.map((template, index) => {
              // Alternate badges for visual variety
              const isTrending = index % 3 === 0;
              const isPopular = index % 3 === 1;

              return (
                <div 
                  key={template.id} 
                  onClick={() => handleTemplateClick(template)}
                  className="group relative aspect-[3/4] rounded-3xl overflow-hidden cursor-pointer shadow-lg shadow-black/40 hover:scale-[1.02] transition-transform duration-300 border border-white/5"
                >
                  {/* Background Image */}
                  <img 
                    src={template.imageUrl} 
                    alt={template.title} 
                    className="w-full h-full object-cover transition-all duration-500"
                  />
                  
                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-90" />
                  
                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex flex-col gap-2">
                      {isTrending && (
                          <span className="px-2 py-1 bg-white/90 backdrop-blur-md rounded-md text-[10px] font-bold text-black uppercase tracking-wider shadow-lg">
                              Trending
                          </span>
                      )}
                      {isPopular && (
                          <span className="px-2 py-1 bg-black/60 border border-white/20 backdrop-blur-md rounded-md text-[10px] font-bold text-white uppercase tracking-wider shadow-lg">
                              Popular
                          </span>
                      )}
                  </div>

                  {/* Content */}
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-bold font-serif text-sm md:text-base leading-tight mb-1 line-clamp-2">{template.title}</h3>
                    <p className="text-slate-400 text-xs font-sans">{template.category}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal */}
        {selectedTemplate && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
            {/* Modal Container */}
            <div className="bg-[#0a0a0a] border border-white/10 w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row h-[90vh] md:h-auto md:max-h-[90vh] animate-slide-up">
              
              {/* Left: Preview */}
              <div className="shrink-0 md:flex-1 bg-black/50 relative flex items-center justify-center p-6 h-[35%] md:h-auto min-h-[200px] border-b md:border-b-0 md:border-r border-white/10">
                {generatedImage ? (
                  <img src={generatedImage} alt="Generated" className="w-full h-full object-contain rounded-xl shadow-2xl" />
                ) : userImage ? (
                  <img src={userImage.preview} alt="Upload" className="w-full h-full object-contain rounded-xl shadow-xl opacity-80" />
                ) : (
                  <div className="text-center text-slate-500 flex flex-col items-center">
                     <img src={selectedTemplate.imageUrl} className="w-24 h-24 md:w-32 md:h-32 rounded-2xl object-cover mb-4 opacity-50" />
                     <p className="text-xs md:text-sm font-sans">Preview of template style</p>
                  </div>
                )}
              </div>

              {/* Right: Controls */}
              <div className="flex-1 flex flex-col min-h-0 bg-[#0a0a0a] w-full md:w-96">
                
                {/* Header */}
                <div className="p-6 pb-2 shrink-0 flex justify-between items-start">
                   <div>
                     <span className="text-xs font-bold text-slate-500 uppercase tracking-[0.2em] mb-1 block">Selected Template</span>
                     <h2 className="text-2xl font-bold text-white font-serif">{selectedTemplate.title}</h2>
                   </div>
                   <button onClick={closeModal} className="p-2 bg-white/5 rounded-full hover:bg-white/10 text-white transition-colors"><X size={20} /></button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto scrollbar-hide px-6 py-4 space-y-6">
                  <p className="text-slate-400 text-sm leading-relaxed font-sans">{selectedTemplate.description}</p>
                  
                  {!generatedImage && (
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-white block font-sans">Upload Source Image</label>
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/10 rounded-2xl hover:border-white/30 hover:bg-white/5 cursor-pointer transition-all group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          <div className="p-3 bg-white/5 rounded-full mb-2 group-hover:bg-white group-hover:text-black transition-colors">
                               <Sparkles size={20} className="text-slate-400 group-hover:text-black" />
                          </div>
                          <p className="text-xs text-slate-400 group-hover:text-white transition-colors font-sans">Click to upload photo</p>
                        </div>
                        <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                      </label>
                    </div>
                  )}
                  
                  {generatedImage && (
                      <div className="p-4 bg-white/10 border border-white/20 rounded-xl text-white text-sm text-center font-medium font-sans">
                          ✨ Image Generated Successfully!
                      </div>
                  )}
                </div>

                {/* Footer Buttons */}
                <div className="p-6 pt-4 border-t border-white/5 shrink-0 space-y-3 bg-[#0a0a0a]">
                  {generatedImage ? (
                      <>
                      <a 
                        href={generatedImage} 
                        download={`ceeplex-${selectedTemplate.id}.png`}
                        className="w-full py-3.5 bg-white text-black font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-slate-200 transition-colors font-sans"
                      >
                        <Download size={18} /> Download Image
                      </a>
                      <button 
                          onClick={() => { setGeneratedImage(null); }}
                          className="w-full py-3.5 bg-white/5 text-white font-medium rounded-xl hover:bg-white/10 transition-colors font-sans"
                      >
                          Try Another Photo
                      </button>
                      </>
                  ) : (
                      <button 
                        onClick={handleGenerate}
                        disabled={!userImage || isGenerating}
                        className="w-full py-4 bg-white text-black font-bold rounded-xl hover:shadow-lg hover:shadow-white/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 font-serif uppercase tracking-wider"
                      >
                        {isGenerating ? 'Creating...' : 'GENERATE ART'}
                        {!isGenerating && <Sparkles size={18} />}
                      </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};