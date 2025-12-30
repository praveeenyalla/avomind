import React, { useState, useEffect, useRef } from 'react';
import { ChatMode } from '../types';
import { CHAT_MODES, NEW_CHAT_SUGGESTIONS, SIDEBAR_ASSISTANT_IDS } from '../constants';

interface NewChatScreenProps {
  onSendMessage: (prompt: string) => void;
  onModeChange: (mode: ChatMode) => void;
  activeMode: ChatMode;
}

const NewChatScreen: React.FC<NewChatScreenProps> = ({ onSendMessage, onModeChange, activeMode }) => {
    return (
        <div className="flex-1 flex flex-col items-center justify-end text-center p-4 pb-0">
            <div className="flex-1 flex flex-col items-center justify-center">
                 <h1 className="text-5xl font-bold mb-4 font-['Michroma',_sans_serif] brand-gradient-text">
                    AvoMind
                 </h1>
                <p className="max-w-md text-lg text-slate-300 animate-fadeInUp mb-8">
                    Hello! I'm AvoMind. Select a persona or just start chatting. How can I assist you today?
                </p>
            </div>
           
            <div className="w-full max-w-4xl mx-auto">
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    {NEW_CHAT_SUGGESTIONS.map(prompt => (
                        <button
                            key={prompt}
                            onClick={() => onSendMessage(prompt)}
                            className="p-3 bg-[#1c1c1f]/60 border border-slate-700/50 rounded-lg text-sm text-slate-300 text-left hover:bg-slate-800/80 hover:border-slate-600 transition-all"
                        >
                            {prompt}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default NewChatScreen;
