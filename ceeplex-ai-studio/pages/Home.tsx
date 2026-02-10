import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Compass, MessageSquare, Image as ImageIcon, ArrowRight, Zap, Layers, Wand2, Instagram, Mail, Phone } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Home = () => {
  const { user } = useAuth();

  return (
    <div className="relative w-full flex flex-col items-center justify-center px-6 pb-24 md:pb-12">
      
      <div className="relative z-10 w-full max-w-6xl flex flex-col items-center">
        
        {/* Hero Card */}
        <div className="w-full glass rounded-[2rem] p-10 md:p-24 text-center relative overflow-hidden shadow-2xl shadow-black/50 mb-16 border border-white/10">
          
          <div className="relative z-10 max-w-4xl mx-auto flex flex-col items-center">
            
            {/* Logo Added Here */}
            <div className="w-24 h-24 flex items-center justify-center mb-8 drop-shadow-2xl">
                <img src="https://iili.io/fpcnLLQ.png" alt="Ceeplex Logo" className="w-full h-full object-contain" />
            </div>

            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/20 backdrop-blur-md mb-8">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse"></span>
              <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white">AI-Powered Creative Engine</span>
            </div>
            
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-serif font-medium mb-8 tracking-tight text-white leading-[1.1]">
              Welcome to <br className="hidden md:block" />
              <span className="italic">Ceeplex</span>
            </h1>
            
            <p className="text-lg md:text-xl text-slate-300 mb-12 max-w-2xl mx-auto leading-relaxed font-light font-sans">
              Unleash your creativity with the next generation of AI tools. 
              Chat, design, and explore templates in a seamless interface.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link to="/chat" className="group relative px-8 py-4 bg-white text-black font-bold font-serif text-lg rounded-full overflow-hidden hover:scale-105 active:scale-95 transition-all duration-300 w-full sm:w-auto border border-white">
                <div className="absolute inset-0 bg-black/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                <div className="relative flex items-center justify-center gap-2 tracking-wide">
                  <Sparkles size={20} className="fill-current" />
                  START NEW CHAT
                </div>
              </Link>
              
              <Link to="/templates" className="group px-8 py-4 glass-pill text-white font-bold font-serif text-lg rounded-full border border-white/20 hover:bg-white hover:text-black hover:scale-105 active:scale-95 transition-all duration-300 w-full sm:w-auto flex items-center justify-center gap-2 tracking-wide">
                 <Compass size={20} />
                 EXPLORE TEMPLATES
              </Link>
            </div>
          </div>
        </div>

        {/* Tools & Details Section */}
        <div className="w-full mb-16">
          <div className="flex items-center gap-4 mb-8 px-4">
             <div className="h-px bg-white/20 flex-1"></div>
             <span className="text-xs font-bold uppercase tracking-[0.3em] text-slate-400">Powerful Tools</span>
             <div className="h-px bg-white/20 flex-1"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <ToolCard 
                to="/chat"
                title="AI Chat Assistant"
                description="Engage in natural conversations, ask complex questions, or brainstorm ideas with our advanced language model."
                icon={<MessageSquare size={32} className="text-white" />}
                delay="0ms"
             />
             <ToolCard 
                to="/templates"
                title="Creative Templates"
                description="Transform your photos instantly using professionally curated styles. Cyberpunk, Watercolor, 3D, and more."
                icon={<Layers size={32} className="text-white" />}
                delay="100ms"
             />
             <ToolCard 
                to="/chat" 
                title="Image Generation"
                description="Describe what you want to see and watch as AI brings your imagination to life in seconds."
                icon={<Wand2 size={32} className="text-white" />}
                delay="200ms"
             />
          </div>
        </div>

        {/* Creator Info Footer */}
        <div className="w-full max-w-3xl mx-auto glass rounded-3xl p-8 border border-white/10 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white mb-2">Trainer & Creator</p>
            <h2 className="text-3xl font-serif text-white mb-6">Lakshya Baradiya</h2>
            
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-400">
                <a href="https://instagram.com/__laksxhya__" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
                    <Instagram size={18} />
                    <span>@__laksxhya__</span>
                </a>
                <a href="https://instagram.com/ceeplex" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
                    <Instagram size={18} />
                    <span>@ceeplex</span>
                </a>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-6 mt-4 text-xs text-slate-500 font-mono">
                <div className="flex items-center gap-2">
                    <Phone size={14} />
                    <span>+916268716414</span>
                </div>
                <div className="flex items-center gap-2">
                    <Mail size={14} />
                    <a href="mailto:ceeplex1@gmail.com" className="hover:text-white transition-colors">ceeplex1@gmail.com</a>
                </div>
            </div>
            <div className="mt-6 pt-6 border-t border-white/10 text-[10px] text-slate-600 uppercase tracking-widest">
                © {new Date().getFullYear()} Ceeplex AI. All rights reserved.
            </div>
        </div>

      </div>
    </div>
  );
};

const ToolCard = ({ to, title, description, icon, delay }: { to: string, title: string, description: string, icon: React.ReactNode, delay: string }) => (
  <Link 
    to={to} 
    className="group relative bg-black/40 border border-white/10 rounded-2xl p-8 hover:bg-white hover:border-white transition-all duration-300 hover:-translate-y-2 overflow-hidden"
    style={{ animationDelay: delay }}
  >
    <div className="relative z-10">
      <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-6 group-hover:bg-black transition-colors duration-300 border border-white/10 group-hover:border-black">
        <div className="group-hover:text-white transition-colors">{icon}</div>
      </div>
      
      <h3 className="text-2xl font-serif text-white mb-3 group-hover:text-black transition-colors">{title}</h3>
      <p className="text-slate-400 text-sm leading-relaxed mb-6 group-hover:text-gray-600 font-sans">
        {description}
      </p>
      
      <div className="flex items-center text-xs font-bold uppercase tracking-widest text-white/50 group-hover:text-black transition-colors">
        Try Now <ArrowRight size={16} className="ml-2 group-hover:translate-x-1 transition-transform" />
      </div>
    </div>
  </Link>
);