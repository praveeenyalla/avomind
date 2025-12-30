import React, { useState, useEffect, useMemo } from 'react';
import Sidebar from './Sidebar';
import ChatWindow from './ChatWindow';
import { Chat, AvoVersionId, ChatModeId, Task, MainView, ThinkConfig } from '../types';
import Header from './Header';
import { v4 as uuidv4 } from 'uuid';
import { CHAT_MODES } from '../constants';
import TasksPage from '../pages/TasksPage';
import HistoryPage from '../pages/HistoryPage';
import VoiceMode from './VoiceMode';
import SettingsModal from './SettingsModal';
import ToolsPage from '../pages/ToolsPage';
import ShareModal from './ShareModal';
import GalleryPage from '../pages/GalleryPage';
import CreatorPage from '../pages/CreatorPage';

const Layout: React.FC = () => {
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const saveHistory = JSON.parse(localStorage.getItem('chatnlp-save-history') ?? 'true');
      if (!saveHistory) return [];
      
      const savedChats = localStorage.getItem('chatnlp_chats');
      if (savedChats) {
        const parsedChats = JSON.parse(savedChats);
        // Validate that parsedChats is an array before attempting to map over it.
        if (!Array.isArray(parsedChats)) {
            console.warn('Saved chats is not an array, clearing storage.');
            localStorage.removeItem('chatnlp_chats');
            localStorage.removeItem('chatnlp_activeChatId');
            return [];
        }
        
        const sanitizedChats = parsedChats.map((chat: any) => {
            // Basic validation: ensure the chat is an object with an ID and a mode with an ID.
            if (typeof chat !== 'object' || chat === null || !chat.id || !chat.mode?.id) {
                return null;
            }

            // Find the canonical ChatMode from constants to ensure it's up-to-date.
            // This prevents crashes if a mode's properties (like the icon function) are stale in localStorage.
            const fullMode = CHAT_MODES.find(m => m.id === chat.mode.id);
            if (!fullMode) {
                return null; // The mode ID from storage is no longer valid.
            }
            
            // Reconstruct the chat object with the fresh mode object and ensure all required fields exist.
            return {
                id: chat.id,
                title: chat.title || 'Untitled Chat',
                messages: Array.isArray(chat.messages) ? chat.messages : [],
                mode: fullMode, // Use the fresh, valid mode object.
                versionId: chat.versionId || 'avo_1_0', // Default to a valid version
                // Carry over optional properties if they exist
                projectFiles: chat.projectFiles,
                assets: chat.assets,
                canvasState: chat.canvasState,
                documentContent: chat.documentContent,
                attachedFile: chat.attachedFile,
                isPinned: chat.isPinned,
            };
        }).filter(Boolean) as Chat[]; // Filter out any null (malformed) chats.
        
        return sanitizedChats;
      }
      return [];
    } catch (error) {
      console.error("Failed to load or sanitize chats from localStorage:", error);
      // If parsing fails, it's likely corrupted. Clear it to prevent a crash loop.
      localStorage.removeItem('chatnlp_chats');
      localStorage.removeItem('chatnlp_activeChatId');
      return [];
    }
  });

  const [deletedChats, setDeletedChats] = useState<Chat[]>(() => {
    try {
      const savedDeletedChats = localStorage.getItem('avomind_deleted_chats');
      return savedDeletedChats ? JSON.parse(savedDeletedChats) : [];
    } catch (error) {
      console.error("Failed to load deleted chats from localStorage:", error);
      return [];
    }
  });
  
  const [tasks, setTasks] = useState<Task[]>(() => {
    try {
      const savedTasks = localStorage.getItem('avomind_tasks');
      return savedTasks ? JSON.parse(savedTasks) : [];
    } catch (error) {
      console.error("Failed to load tasks from localStorage:", error);
      return [];
    }
  });

  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    try {
      const savedActiveChatId = localStorage.getItem('chatnlp_activeChatId');
      return savedActiveChatId ? JSON.parse(savedActiveChatId) : null;
    } catch (error) {
      console.error("Failed to load active chat ID from localStorage:", error);
      return null;
    }
  });
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [currentVersionId, setCurrentVersionId] = useState<AvoVersionId>('avo_1_0');
  const [mainView, setMainView] = useState<MainView>('chat');
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);


  const activeChat = useMemo(() => chats.find(c => c.id === activeChatId), [chats, activeChatId]);

  useEffect(() => {
    if (activeChat) {
      setCurrentVersionId(activeChat.versionId);
    } else {
      // Reset to a default for new chats.
      setCurrentVersionId('avo_1_0');
    }
  }, [activeChat]);

  useEffect(() => {
    const saveHistory = JSON.parse(localStorage.getItem('chatnlp-save-history') ?? 'true');
    if (saveHistory) {
      try {
        localStorage.setItem('chatnlp_chats', JSON.stringify(chats));
        localStorage.setItem('chatnlp_activeChatId', JSON.stringify(activeChatId));
        localStorage.setItem('avomind_tasks', JSON.stringify(tasks));
        localStorage.setItem('avomind_deleted_chats', JSON.stringify(deletedChats));
      } catch (error) {
        console.error("Failed to save session to localStorage:", error);
      }
    }
  }, [chats, activeChatId, tasks, deletedChats]);


  const handleDeleteChat = (chatId: string) => {
    const chatToDelete = chats.find(chat => chat.id === chatId);
    if (chatToDelete) {
        setDeletedChats(prev => [chatToDelete, ...prev]);
        setChats(prevChats => prevChats.filter(chat => chat.id !== chatId));
        if (activeChatId === chatId) {
            setActiveChatId(null);
        }
    }
  };

  const handleRestoreChat = (chatId: string) => {
      const chatToRestore = deletedChats.find(chat => chat.id === chatId);
      if (chatToRestore) {
          setChats(prev => [chatToRestore, ...prev]);
          setDeletedChats(prev => prev.filter(chat => chat.id !== chatId));
      }
  };

  const handlePermanentlyDeleteChat = (chatId: string) => {
      if (window.confirm("Are you sure you want to permanently delete this chat? This action cannot be undone.")) {
          setDeletedChats(prev => prev.filter(chat => chat.id !== chatId));
      }
  };


  const handleSelectChat = (id: string | null) => {
    setActiveChatId(id);
    setMainView('chat');
    setIsSidebarOpen(false); // Close sidebar on chat selection/creation on mobile
  };

  const handleCreateNewChat = (modeId: ChatModeId = 'neutral') => {
      const mode = CHAT_MODES.find(m => m.id === modeId)!;
      const newChatId = uuidv4();
      const newChat: Chat = {
        id: newChatId,
        title: `New ${mode.name} Chat`,
        messages: [],
        mode: mode,
        versionId: currentVersionId,
        assets: [],
        ...(mode.id === 'canvas' && { canvasState: { nodes: [], edges: [], transform: { x: 0, y: 0, scale: 1 } } }),
        ...(mode.id === 'website_creator' && { projectFiles: [] }),
        ...(mode.id === 'creative_writer' && { documentContent: '' }),
      };
      setChats(prev => [newChat, ...prev]);
      setActiveChatId(newChatId);
      setMainView('chat');
      setIsSidebarOpen(false);
  };
  
  const handleSelectTool = (modeId: ChatModeId) => {
    if (activeChatId) {
        // An active chat exists, so we switch its mode instead of creating a new one.
        const newMode = CHAT_MODES.find(m => m.id === modeId);
        if (newMode) {
             setChats(prev => prev.map(c => 
                c.id === activeChatId ? { ...c, mode: newMode } : c
            ));
        }
        setMainView('chat');
        setIsSidebarOpen(false);
    } else {
        // No active chat, so create a new one with the selected tool.
        handleCreateNewChat(modeId);
    }
  };

  const handleCreateDocumentChat = (file: { name: string; type: string; content: string; dataUrl: string; }) => {
    const mode = CHAT_MODES.find(m => m.id === 'document_qa')!;
    const newChat: Chat = {
      id: uuidv4(),
      title: file.name,
      messages: [],
      mode: mode,
      versionId: currentVersionId,
      attachedFile: file,
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
    setMainView('chat');
    setIsSidebarOpen(false);
  };

  const handleVersionChange = (newVersionId: AvoVersionId) => {
      setCurrentVersionId(newVersionId); // Optimistic UI update
      if (activeChatId) {
          setChats(prevChats => 
              prevChats.map(chat => 
                  chat.id === activeChatId ? { ...chat, versionId: newVersionId } : chat
              )
          );
      }
      // If no active chat, `currentVersionId` is already updated and will be used for the next new chat.
  };
  
  const renderMainView = () => {
      switch(mainView) {
          case 'tasks':
              return <TasksPage tasks={tasks} setTasks={setTasks} />;
          case 'history':
              return <HistoryPage 
                chats={chats} 
                deletedChats={deletedChats}
                onSelectChat={handleSelectChat}
                onRestoreChat={handleRestoreChat}
                onPermanentlyDeleteChat={handlePermanentlyDeleteChat}
              />;
          case 'tools':
              return <ToolsPage onSelectTool={handleSelectTool} />;
          case 'my-media':
              return <GalleryPage 
                chats={chats} 
                onCreateNewChat={handleCreateNewChat}
                onSelectChat={handleSelectChat}
              />;
          case 'create':
              return <CreatorPage onSelectTool={handleSelectTool} />;
          case 'chat':
          default:
              return <ChatWindow 
                chats={chats}
                setChats={setChats}
                activeChatId={activeChatId}
                setActiveChatId={setActiveChatId}
                currentVersionId={currentVersionId}
                setTasks={setTasks}
              />;
      }
  };

  return (
    <div className="flex h-screen w-screen bg-[#111111] text-slate-200 overflow-hidden flex-col">
       <Header 
        onMenuClick={() => setIsSidebarOpen(!isSidebarOpen)} 
        onToggleShare={() => activeChatId ? setIsShareModalOpen(true) : alert("Please select a chat to share.")}
       />
       <SettingsModal 
          isOpen={isSettingsModalOpen}
          onClose={() => setIsSettingsModalOpen(false)}
       />
       <ShareModal 
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          chatTitle={activeChat?.title || 'Conversation'}
       />
       {isVoiceModeOpen && (
            <VoiceMode
                onClose={(voiceHistory) => {
                    setIsVoiceModeOpen(false);
                    if (voiceHistory.length > 0) {
                        const newChatId = uuidv4();
                        const newChat = {
                            id: newChatId,
                            title: voiceHistory[0].text.substring(0, 30) + '...',
                            messages: voiceHistory,
                            mode: CHAT_MODES.find(m => m.id === 'neutral')!,
                            versionId: currentVersionId,
                        };
                        setChats(prev => [newChat, ...prev]);
                        handleSelectChat(newChatId);
                    }
                }}
                initialHistory={activeChat?.messages || []}
                chatMode={activeChat?.mode || CHAT_MODES.find(m => m.id === 'neutral')!}
                versionId={currentVersionId}
            />
        )}
      <div className="flex flex-1 overflow-hidden">
        {/* Mobile sidebar overlay */}
        {isSidebarOpen && !isSidebarCollapsed && (
          <div 
            className="fixed inset-0 bg-black/60 z-20 md:hidden"
            onClick={() => setIsSidebarOpen(false)}
            aria-hidden="true"
          ></div>
        )}

        {/* Sidebar Container */}
        <div 
          className={`
            fixed top-0 left-0 h-full z-30 transition-all duration-300 ease-in-out md:relative md:top-auto md:left-auto md:h-auto
            ${isSidebarCollapsed ? 'w-20' : 'w-72'}
            ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}
        >
          <Sidebar 
            chats={chats} 
            activeChatId={activeChatId}
            setActiveChatId={handleSelectChat}
            onDeleteChat={handleDeleteChat}
            isCollapsed={isSidebarCollapsed}
            toggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
            onCreateNewChat={handleCreateNewChat}
            onCreateDocumentChat={handleCreateDocumentChat}
            mainView={mainView}
            setMainView={setMainView}
            onToggleVoiceMode={() => setIsVoiceModeOpen(true)}
            onToggleSettings={() => setIsSettingsModalOpen(true)}
            activeVersionId={currentVersionId}
            onVersionChange={handleVersionChange}
          />
        </div>
        
        <main className="flex-1 flex flex-col h-full relative">
          {/* Background for the chat area */}
          <div className="absolute inset-0 w-full h-full bg-[#111111] overflow-hidden aurora-background" />

          {/* Chat window content on top */}
          <div className="relative z-10 flex-1 flex flex-col h-full">
              {renderMainView()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;