import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useTextToSpeech } from '../hooks/useTextToSpeech';
import { 
    XIcon, CameraIcon, UserCircleIcon, SlidersHorizontalIcon, HeadphonesIcon, 
    DatabaseIcon, InfoIcon, TrashIcon, PlayIcon, PauseIcon 
} from './Icons';

type Tab = 'profile' | 'preferences' | 'voice' | 'data' | 'about';
type ThemePreference = 'system' | 'light' | 'dark';

const ToggleSwitch: React.FC<{
  label: string;
  description: string;
  enabled: boolean;
  onChange: () => void;
}> = ({ label, description, enabled, onChange }) => (
  <div
    onClick={onChange}
    className="flex items-center justify-between cursor-pointer p-3 rounded-lg hover:bg-white/5"
    role="switch"
    aria-checked={enabled}
  >
    <div className="flex-grow pr-4">
      <p className="text-sm font-medium text-slate-200">{label}</p>
      <p className="text-xs text-slate-400">{description}</p>
    </div>
    <div className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors flex-shrink-0 ${enabled ? 'bg-blue-600' : 'bg-slate-700'}`}>
      <span
        className={`inline-block w-4 h-4 transform transition-transform bg-white rounded-full ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </div>
  </div>
);


const SettingsModal: React.FC<{ isOpen: boolean; onClose: () => void; }> = ({ isOpen, onClose }) => {
  const { user, login } = useAuth();
  const { themePreference, setThemePreference } = useTheme();

  const [activeTab, setActiveTab] = useState<Tab>('profile');

  // State for Profile Tab
  const [name, setName] = useState(user?.name || '');
  const [avatar, setAvatar] = useState<string | undefined>(user?.avatar);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Voice Tab
  const [autoSend, setAutoSend] = useState(() => JSON.parse(localStorage.getItem('chatnlp-autosend') || 'false'));
  const [autoTTS, setAutoTTS] = useState(() => JSON.parse(localStorage.getItem('chatnlp-autotts') || 'false'));
  const { voices, speak, cancel, playbackState } = useTextToSpeech();
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem('chatnlp-selected-voice') || '');
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  // State for Preferences Tab
  const [saveHistory, setSaveHistory] = useState(() => JSON.parse(localStorage.getItem('chatnlp-save-history') ?? 'true'));

  useEffect(() => {
    if (user && isOpen) {
      setName(user.name);
      setAvatar(user.avatar);
    }
  }, [user, isOpen]);
  
  useEffect(() => {
    if (voices.length > 0 && !selectedVoice) {
        const defaultVoice = voices.find(v => v.default) || voices[0];
        if (defaultVoice) {
            setSelectedVoice(defaultVoice.name);
            localStorage.setItem('chatnlp-selected-voice', defaultVoice.name);
        }
    }
  }, [voices, selectedVoice]);

  useEffect(() => {
    if (playbackState === 'idle') {
        setPreviewingVoice(null);
    }
  }, [playbackState]);

  useEffect(() => {
      if (!isOpen) {
          cancel();
      }
  }, [isOpen, cancel]);


  if (!isOpen || !user) {
    return null;
  }
  
  const handleAutoSendToggle = () => {
    const newValue = !autoSend;
    setAutoSend(newValue);
    localStorage.setItem('chatnlp-autosend', JSON.stringify(newValue));
  };

  const handleAutoTTSToggle = () => {
    const newValue = !autoTTS;
    setAutoTTS(newValue);
    localStorage.setItem('chatnlp-autotts', JSON.stringify(newValue));
  };
  
  const handleSaveHistoryToggle = () => {
      const newValue = !saveHistory;
      setSaveHistory(newValue);
      localStorage.setItem('chatnlp-save-history', JSON.stringify(newValue));
      if (!newValue) {
          alert("Chat history will no longer be saved to this browser after your session ends. Existing history will remain until cleared.");
      }
  };
  
  const handleClearHistory = () => {
      if (window.confirm("Are you sure you want to permanently delete all your chat history from this browser? This action cannot be undone.")) {
          localStorage.removeItem('chatnlp_chats');
          localStorage.removeItem('chatnlp_activeChatId');
          localStorage.removeItem('avomind_deleted_chats');
          window.location.reload();
      }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatar(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    login({ name, avatar });
    onClose();
  };

  const handleVoiceChange = (voiceName: string) => {
    setSelectedVoice(voiceName);
    localStorage.setItem('chatnlp-selected-voice', voiceName);
  };

  const handlePreviewVoice = (voiceName: string) => {
    if (playbackState === 'playing' && previewingVoice === voiceName) {
        cancel();
        setPreviewingVoice(null);
    } else {
        setPreviewingVoice(voiceName);
        speak('Hello, I am a voice assistant from AvoMind.', voiceName);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'profile':
        return (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                {avatar ? (
                  <img src={avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover" />
                ) : (
                  <UserCircleIcon className="w-24 h-24 text-slate-500" />
                )}
                <button
                  onClick={handleAvatarClick}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Change avatar"
                >
                  <CameraIcon className="w-8 h-8 text-white" />
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" />
              <p className="text-sm text-slate-400">{user.plan}</p>
            </div>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-[#101216] border border-white/10 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter your display name"
              />
            </div>
          </div>
        );
      case 'preferences':
        return (
            <div className="space-y-4">
                <div>
                    <h3 className="text-sm font-medium text-slate-300 mb-2 px-3">Theme</h3>
                    <div className="flex items-center gap-2 bg-slate-800/60 p-1 rounded-lg">
                        {(['system', 'light', 'dark'] as ThemePreference[]).map(pref => (
                            <button
                                key={pref}
                                onClick={() => setThemePreference(pref)}
                                className={`flex-1 py-1.5 text-sm rounded-md transition-colors ${themePreference === pref ? 'bg-blue-600 text-white' : 'hover:bg-slate-700/50'}`}
                            >
                                {pref.charAt(0).toUpperCase() + pref.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>
                 <ToggleSwitch 
                    label="Save chat history"
                    description="Store your conversations in this browser for future sessions."
                    enabled={saveHistory}
                    onChange={handleSaveHistoryToggle}
                />
            </div>
        );
      case 'voice':
        return (
          <div className="space-y-2">
             <ToggleSwitch 
                label="Auto-send after transcription"
                description="In Voice Mode, send your message after you finish speaking."
                enabled={autoSend}
                onChange={handleAutoSendToggle}
              />
              <ToggleSwitch 
                label="Enable AI Voice Replies (Talk Back)"
                description="Automatically read AI responses aloud as they arrive."
                enabled={autoTTS}
                onChange={handleAutoTTSToggle}
              />
              <div className="border-t border-white/10 pt-4 mt-2">
                  <h3 className="text-base font-semibold text-slate-100 px-3 mb-2">Voice Selection</h3>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-2">
                      {voices.map(voice => (
                          <div key={voice.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-white/5">
                              <label className="flex items-center gap-3 cursor-pointer flex-1 overflow-hidden">
                                  <input
                                      type="radio"
                                      name="voice-selection"
                                      checked={selectedVoice === voice.name}
                                      onChange={() => handleVoiceChange(voice.name)}
                                      className="form-radio h-4 w-4 bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-600"
                                  />
                                  <span className="text-sm text-slate-200 truncate">{voice.name} ({voice.lang})</span>
                              </label>
                              <button onClick={() => handlePreviewVoice(voice.name)} className="p-1 text-slate-400 hover:text-white" aria-label={`Preview ${voice.name}`}>
                                { (playbackState === 'playing' && previewingVoice === voice.name) ? <PauseIcon className="w-4 h-4 text-sky-400" /> : <PlayIcon className="w-4 h-4" /> }
                              </button>
                          </div>
                      ))}
                      {voices.length === 0 && <p className="text-xs text-slate-500 px-3">No voices available in your browser.</p>}
                  </div>
              </div>
          </div>
        );
      case 'data':
         return (
            <div className="space-y-4">
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <h3 className="text-sm font-medium text-red-300">Clear History</h3>
                    <p className="text-xs text-red-400/80 mb-3">Permanently delete all conversation data from this browser. This cannot be undone.</p>
                     <button onClick={handleClearHistory} className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm rounded-md text-red-300 bg-red-500/20 hover:bg-red-500/30 transition-colors">
                        <TrashIcon className="w-4 h-4" /> Clear All Chat Data
                    </button>
                </div>
            </div>
        );
      case 'about':
        return (
            <div className="text-center text-slate-400 text-sm space-y-2">
                <h2 className="text-lg font-bold text-white">AvoMind</h2>
                <p>Version 1.0.0</p>
                <p>A next-generation AI assistant.</p>
                <p className="pt-4">Created by <span className="font-semibold text-slate-300">NAGAPraveen Yalla</span>.</p>
            </div>
        )
      default:
        return null;
    }
  };

  const tabs: { id: Tab, label: string, icon: React.FC<any> }[] = [
      { id: 'profile', label: 'Profile', icon: UserCircleIcon },
      { id: 'preferences', label: 'Preferences', icon: SlidersHorizontalIcon },
      { id: 'voice', label: 'Voice', icon: HeadphonesIcon },
      { id: 'data', label: 'Data', icon: DatabaseIcon },
      { id: 'about', label: 'About', icon: InfoIcon },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fadeInUp"
      aria-labelledby="settings-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-2xl bg-[#1C1F26] rounded-xl border border-white/10 shadow-2xl flex flex-col md:flex-row h-[90vh] md:h-auto max-h-[600px]">
        <div className="flex-shrink-0 p-4 border-b md:border-b-0 md:border-r border-white/10 md:w-48">
             <div className="flex items-center justify-between mb-4">
                <h2 id="settings-modal-title" className="text-lg font-bold text-white">
                    Settings
                </h2>
                <button
                    onClick={onClose}
                    className="p-1 rounded-full text-slate-400 hover:bg-white/10 hover:text-white transition-transform hover:scale-110 md:hidden"
                    aria-label="Close modal"
                >
                    <XIcon className="w-5 h-5" />
                </button>
            </div>
            <nav className="flex flex-row md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors whitespace-nowrap ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700/50'}`}
                    >
                        <tab.icon className="w-5 h-5" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </nav>
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 p-6 overflow-y-auto">
                {renderTabContent()}
            </div>
            <div className="flex-shrink-0 flex items-center justify-end gap-3 p-4 border-t border-white/10 bg-black/20">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-semibold text-slate-300 bg-transparent rounded-lg hover:bg-white/5 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-all"
                >
                    Save Changes
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
