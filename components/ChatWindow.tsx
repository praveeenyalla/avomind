import React, { useState, useEffect, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { ChatMode, Message, Attachment, Chat, AvoVersionId, Asset, AvoVersion, ProjectFiles, ThinkConfig, ChatModeId, Task } from '../types';
import { CHAT_MODES } from '../constants';
import ChatInput from './ChatInput';
import MessageComponent from './Message';
import { generateTextResponse, generateImageResponse, generateVideo, editImage, generateDeepResearchResponse, detectActionableTask } from '../services/geminiService';
import { MenuIcon, CodeXmlIcon, MessageSquareIcon, PenLineIcon, BrushIcon } from './Icons';
import WebsiteCreatorView from './WebsiteCreatorView';
import WriterView from './WriterView';
import { useAuth } from '../contexts/AuthContext';
import { useUsageTracker } from '../hooks/useUsageTracker';
import CustomPersonaModal from './CustomPersonaModal';
import NewChatScreen from './NewChatScreen';
import VoiceMode from './VoiceMode';
import CanvasView from './CanvasView';
import DrawView from './DrawView';
import DocumentView from './DocumentView';

interface ChatWindowProps {
  chats: Chat[];
  setChats: React.Dispatch<React.SetStateAction<Chat[]>>;
  activeChatId: string | null;
  setActiveChatId: (id: string | null) => void;
  currentVersionId: AvoVersionId;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
}

const parseProjectFilesFromMarkdown = (markdown: string): ProjectFiles => {
    const files: ProjectFiles = [];
    // Regex to find code blocks with a file path as the language specifier
    const codeBlockRegex = /```([^\r\n`]+)\r?\n([\s\S]*?)\r?\n```/g;
    
    let match;
    while ((match = codeBlockRegex.exec(markdown)) !== null) {
        const path = match[1].trim();
        const content = match[2].trim();

        // Basic validation to avoid matching simple code blocks like ```javascript
        if (path.includes('/') || path.includes('.')) {
            // Avoid duplicates - always take the last version of a file
            const existingIndex = files.findIndex(f => f.path === path);
            if (existingIndex !== -1) {
                files[existingIndex] = { path, content };
            } else {
                files.push({ path, content });
            }
        }
    }
    
    return files;
};

const ChatWindow: React.FC<ChatWindowProps> = ({ chats, setChats, activeChatId, setActiveChatId, currentVersionId, setTasks }) => {
  const [activeMode, setActiveMode] = useState<ChatMode>(CHAT_MODES.find(m => m.id === 'neutral')!);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userHasScrolledUp = useRef(false);
  const { user } = useAuth();
  const { canGenerateVideo, incrementVideoCount, currentVideoCount, videoLimit } = useUsageTracker();
  const [websiteViewTab, setWebsiteViewTab] = useState<'chat' | 'editor'>('chat');
  const [isCustomPersonaModalOpen, setIsCustomPersonaModalOpen] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const [voiceEndedInfo, setVoiceEndedInfo] = useState<{ duration: number } | null>(null);
  const voiceModeStartTime = useRef<number | null>(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);

  const activeChat = chats.find(c => c.id === activeChatId);
  const currentChatMode = activeChat ? activeChat.mode : activeMode;
  const isWebsiteMode = currentChatMode.id === 'website_creator';
  const isCanvasMode = currentChatMode.id === 'canvas';
  const isWriterMode = currentChatMode.id === 'creative_writer';
  const isDocumentMode = currentChatMode.id === 'document_qa';

  const handleAddTask = (title: string) => {
    const newTask: Task = {
        id: uuidv4(),
        title,
        completed: false,
        priority: 'medium',
        createdAt: new Date().toISOString(),
    };
    setTasks(prev => [newTask, ...prev]);
  };


  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (!container) return;
    const isAtBottom = container.scrollHeight - container.clientHeight <= container.scrollTop + 10;
    userHasScrolledUp.current = !isAtBottom;
  };

  useEffect(() => {
    if (activeChat) {
      setActiveMode(activeChat.mode);
    } else {
      // When there's no active chat, reset to the default mode
      setActiveMode(CHAT_MODES.find(m => m.id === 'neutral')!);
    }
  }, [activeChatId, activeChat]);

  useEffect(() => {
    if (!userHasScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeChat?.messages]);
  
  const handleModeChange = (newMode: ChatMode) => {
    setActiveMode(newMode);
    // This function will now primarily affect new chats.
    // Existing chats retain their mode.
  };

  const handleModeChangeById = (modeId: ChatModeId) => {
    const newMode = CHAT_MODES.find(m => m.id === modeId);
    if (!newMode) return;

    // Special case for canvas - it always creates a new chat session.
    if (newMode.id === 'canvas') {
        const newChat: Chat = {
            id: uuidv4(),
            title: "New Canvas",
            messages: [],
            mode: newMode,
            versionId: currentVersionId,
            canvasState: {
                nodes: [],
                edges: [],
                transform: { x: 0, y: 0, scale: 1 }
            }
        };
        setChats(prev => [newChat, ...prev]);
        setActiveChatId(newChat.id);
    } else if (activeChatId) {
        // If there's an active chat, update its mode.
        setChats(prev => prev.map(c => 
            c.id === activeChatId ? { ...c, mode: newMode } : c
        ));
    } else {
        // If on the new chat screen, just update the selected mode for the next chat.
        setActiveMode(newMode);
    }
  };
  
  const handleUpdateMessage = (messageId: string, newText: string) => {
    if (!activeChatId) return;
    setChats(prevChats =>
      prevChats.map(chat =>
        chat.id === activeChatId
          ? {
              ...chat,
              messages: chat.messages.map(msg =>
                msg.id === messageId ? { ...msg, text: newText } : msg
              ),
            }
          : chat
      )
    );
  };
  
  const handleToggleVoiceMode = () => {
    voiceModeStartTime.current = Date.now();
    setIsVoiceModeOpen(true);
  };

  const handleVoiceModeClose = (voiceHistory: Message[]) => {
      setIsVoiceModeOpen(false);
      const duration = voiceModeStartTime.current ? Math.round((Date.now() - voiceModeStartTime.current) / 1000) : 0;
      setVoiceEndedInfo({ duration });

      if (voiceHistory.length === 0) return;

      if (activeChat) {
          // Add voice messages to the existing chat
          setChats(prev => prev.map(c => 
              c.id === activeChat.id 
                  ? { ...c, messages: [...c.messages, ...voiceHistory] }
                  : c
          ));
      } else {
          // Create a new chat with the voice conversation
          const firstUserMessage = voiceHistory.find(m => m.sender === 'user');
          const title = firstUserMessage?.text.substring(0, 30) + (firstUserMessage && firstUserMessage.text.length > 30 ? '...' : '') || 'Voice Chat';
          const newChat: Chat = {
              id: uuidv4(),
              title,
              messages: voiceHistory,
              mode: activeMode,
              versionId: currentVersionId,
              assets: [],
          };
          setChats(prev => [newChat, ...prev]);
          setActiveChatId(newChat.id);
      }
  };


  const handleSendMessage = async (text: string, attachment?: Attachment, fromUserMessageId?: string, thinkConfig?: ThinkConfig) => {
    const userMessage: Message = { id: fromUserMessageId || uuidv4(), text, sender: 'user', timestamp: new Date().toISOString(), attachment };
    const botMessageId = uuidv4();
    setIsSending(true);
    userHasScrolledUp.current = false;

    let chatForGeneration: Chat;
    let currentChatId: string;
    const existingChat = chats.find(c => c.id === activeChatId);
    
    if (fromUserMessageId && existingChat) {
        // This is a resubmit/edit flow
        currentChatId = existingChat.id;
        const messageIndex = existingChat.messages.findIndex(m => m.id === fromUserMessageId);
        if (messageIndex === -1) {
            console.error('Could not find message to resubmit from.');
            setIsSending(false);
            return;
        }

        const updatedUserMessage = { ...existingChat.messages[messageIndex], text, attachment };
        const messages = [...existingChat.messages.slice(0, messageIndex), updatedUserMessage];
        
        const placeholder = createPlaceholderMessage(botMessageId, existingChat.mode, text, attachment, thinkConfig);
        chatForGeneration = { ...existingChat, messages: [...messages, placeholder] };
        
        setChats(prevChats => prevChats.map(c => c.id === currentChatId ? chatForGeneration : c));
    } else if (existingChat) {
        // Standard "add to existing chat" flow
        currentChatId = existingChat.id;
        const placeholder = createPlaceholderMessage(botMessageId, existingChat.mode, text, attachment, thinkConfig);
        chatForGeneration = { ...existingChat, messages: [...existingChat.messages, userMessage, placeholder] };
        setChats(prevChats => prevChats.map(c => c.id === currentChatId ? chatForGeneration : c));
    } else {
        // Standard "new chat" flow
        const newChatId = uuidv4();
        currentChatId = newChatId;
        setActiveChatId(newChatId);
        const placeholder = createPlaceholderMessage(botMessageId, activeMode, text, attachment, thinkConfig);
        const newChat: Chat = {
          id: newChatId,
          title: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
          messages: [userMessage, placeholder],
          mode: activeMode,
          versionId: currentVersionId,
          assets: [],
          projectFiles: activeMode.id === 'website_creator' ? [] : undefined,
          documentContent: activeMode.id === 'creative_writer' ? '' : undefined,
        };
        chatForGeneration = newChat;
        setChats(prevChats => [newChat, ...prevChats]);
    }


    try {
      const { mode: chatModeForCall, messages: historyForCall, versionId: versionIdForCall, attachedFile } = chatForGeneration;

      // Special handler for "Draw a Sketch" mode
      if (text.startsWith('sketch::')) {
        const requestType = text.split('::')[1];
        handleDrawAndGenerate(requestType, attachment!, currentChatId, versionIdForCall, userMessage);
        return; // Stop further execution in this function
      }
      
       if (thinkConfig) {
          const stream = await generateDeepResearchResponse(text, historyForCall.slice(0, -2), thinkConfig, versionIdForCall);
          let fullResponse = '';
          for await (const chunk of stream) {
            fullResponse += chunk.text;
            setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: c.messages.map(m => m.id === botMessageId ? { ...m, text: fullResponse } : m) } : c));
          }
           setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: c.messages.map(m => m.id === botMessageId ? { ...m, status: 'completed' } : m) } : c));
           return;
      }
      
      switch (chatModeForCall.id) {
        case 'image_creator': {
            let finalImageUrl: string;
            let finalText: string;
            if (attachment) {
                const { imageUrl, text: imageText } = await editImage(text, attachment);
                finalImageUrl = imageUrl;
                finalText = imageText;
            } else {
                finalImageUrl = await generateImageResponse(text);
                finalText = '';
            }
            const imageMessage: Message = { id: botMessageId, text: finalText, sender: 'bot', timestamp: new Date().toISOString(), imageUrl: finalImageUrl, status: 'completed' };
            const newAsset: Asset = { id: botMessageId, type: 'image', url: finalImageUrl, prompt: text, timestamp: new Date().toISOString() };
            
            setChats(prev => prev.map(c => c.id === currentChatId ? { 
                ...c, 
                messages: c.messages.map(m => m.id === botMessageId ? imageMessage : m),
                assets: [...(c.assets || []), newAsset]
            } : c));
            break;
        }
        case 'video_creator': {
            if (user?.plan === 'Pro Plan' && !canGenerateVideo()) {
              throw new Error(`You have reached your daily limit of ${videoLimit} videos for the Pro Plan (${currentVideoCount}/${videoLimit} used). Please try again tomorrow.`);
            }

            const onUpdate = (statusText: string) => {
              setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: c.messages.map(m => m.id === botMessageId ? { ...m, text: statusText } : m) } : c));
            };
            
            const { videoUrl, audioDescription } = await generateVideo(text, onUpdate);
            
            if (user?.plan === 'Pro Plan') {
              incrementVideoCount();
            }

            const videoMessage: Message = { 
              id: botMessageId, 
              text: `Here is the video I created. Press play to hear a generated audio description for the scene.`,
              sender: 'bot', 
              timestamp: new Date().toISOString(), 
              videoUrl,
              audioDescription,
              status: 'completed' 
            };
             const newAsset: Asset = { id: botMessageId, type: 'video', url: videoUrl, prompt: text, timestamp: new Date().toISOString() };
            setChats(prev => prev.map(c => c.id === currentChatId ? { 
                ...c, 
                messages: c.messages.map(m => m.id === botMessageId ? videoMessage : m),
                assets: [...(c.assets || []), newAsset]
            } : c));
            break;
        }
        default: {
          // Handle document Q&A mode by providing file content as context
          let finalPrompt = text;
          let finalAttachment = attachment;
          if (chatModeForCall.id === 'document_qa' && attachedFile) {
            if (attachedFile.type.startsWith('image/')) {
                // If it's an image, pass it as an attachment
                finalAttachment = { name: attachedFile.name, type: attachedFile.type, dataUrl: attachedFile.dataUrl };
            } else {
                // If text, prepend to prompt
                finalPrompt = `Based on the following document content, please answer the user's question.\n\nDOCUMENT CONTENT:\n---\n${attachedFile.content}\n---\n\nUSER QUESTION: ${text}`;
            }
          }

          const stream = await generateTextResponse(finalPrompt, historyForCall.slice(0, -2), chatModeForCall, finalAttachment, versionIdForCall);
          let fullResponse = '';
          let groundingChunks: any[] = [];

          for await (const chunk of stream) {
            fullResponse += chunk.text;
            if (chunk.candidates?.[0]?.groundingMetadata?.groundingChunks) {
              groundingChunks = chunk.candidates[0].groundingMetadata.groundingChunks;
            }
            
            setChats(prev => prev.map(c => {
                if (c.id !== currentChatId) return c;

                // Fix: Clean the response during streaming to hide internal language tags from the user.
                const cleanedResponse = fullResponse.replace(/^\[lang=(en-US|te-IN)\]\s*/, '');
                
                const updatedMessages = c.messages.map(m => m.id === botMessageId ? { ...m, text: cleanedResponse } : m);
                
                // Live-parse project files for website creator mode (uses raw response)
                if (chatModeForCall.id === 'website_creator') {
                    const parsedFiles = parseProjectFilesFromMarkdown(fullResponse);
                    return { ...c, messages: updatedMessages, projectFiles: parsedFiles };
                }
                
                return { ...c, messages: updatedMessages };
            }));
          }

          // Fix: Clean the final response to ensure no internal language tags are saved or displayed.
          const cleanedFinalResponse = fullResponse.replace(/^\[lang=(en-US|te-IN)\]\s*/, '');
          const finalMessage: Message = {
            id: botMessageId,
            text: cleanedFinalResponse,
            sender: 'bot',
            timestamp: new Date().toISOString(),
            status: 'completed',
            sources: groundingChunks.length > 0 ? groundingChunks.map(gc => gc.web).filter(Boolean) : undefined,
          };

          setChats(prev => prev.map(c => {
            if (c.id !== currentChatId) return c;
            
            const updatedMessages = c.messages.map(m => m.id === botMessageId ? finalMessage : m);
    
            // Ensure final project files are set correctly
            if (chatModeForCall.id === 'website_creator') {
                const finalParsedFiles = parseProjectFilesFromMarkdown(fullResponse);
                return { ...c, messages: updatedMessages, projectFiles: finalParsedFiles };
            }
            
            return { ...c, messages: updatedMessages };
          }));
          
          // Non-blocking task detection after response is complete
          detectActionableTask(userMessage.text).then(taskInfo => {
              if (taskInfo) {
                  setChats(prev => prev.map(c => c.id === currentChatId ? {
                      ...c,
                      messages: c.messages.map(m => m.id === userMessage.id ? { ...m, actionableTask: { title: taskInfo.title, detected: true } } : m)
                  } : c));
              } else {
                  setChats(prev => prev.map(c => c.id === currentChatId ? {
                      ...c,
                      messages: c.messages.map(m => m.id === userMessage.id ? { ...m, actionableTask: { title: '', detected: true } } : m)
                  } : c));
              }
          });
          break;
        }
      }
    } catch (error) {
      console.error('Error generating response:', error);
      let errorText = 'Sorry, I encountered an unexpected error. Please try again.';
      if (error instanceof Error) errorText = error.message;
      const errorMessage: Message = {
        id: botMessageId,
        text: `**An error occurred:** ${errorText}`,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        status: 'failed',
        originalPrompt: text,
        attachment: attachment
      };
      setChats(prev => prev.map(c => c.id === currentChatId ? { ...c, messages: c.messages.map(m => m.id === botMessageId ? errorMessage : m) } : c));
    } finally {
      setIsSending(false);
    }
  };

  const handleDrawAndGenerate = async (
    requestType: string, // e.g., 'generate_image'
    sketchAttachment: Attachment,
    chatId: string,
    versionId: AvoVersionId,
    userMessage: Message
  ) => {
    const placeholderId = uuidv4();
    
    // Replace the user's placeholder message with the real one and add a bot placeholder
    setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        const messages = c.messages.filter(m => m.id !== userMessage.id);
        const placeholder: Message = { id: placeholderId, text: 'Interpreting your sketch...', sender: 'bot', timestamp: new Date().toISOString(), status: 'generating' };
        return { ...c, messages: [...messages, userMessage, placeholder] };
    }));

    try {
        // Step 1: Interpret sketch to get a text prompt
        const interpretMode: ChatMode = {
            id: 'neutral', name: 'Sketch Interpreter', icon: BrushIcon, placeholder: '', color: '#eab308',
            systemInstruction: "You are an expert at interpreting sketches and drawings. A user has provided a sketch. Your task is to convert this visual concept into a detailed, vivid, and creative text prompt suitable for an advanced AI image or video generation model. **Crucially, the description must be rich with color details, resulting in a full-color image or video, not black and white.** Respond ONLY with the generated prompt itself, without any conversational text, introductions, or explanations.",
        };
        const interpretStream = await generateTextResponse("Interpret this sketch", [], interpretMode, sketchAttachment, versionId);
        let generatedPrompt = '';
        for await (const chunk of interpretStream) { generatedPrompt += chunk.text; }
        generatedPrompt = generatedPrompt.trim();

        if (!generatedPrompt) throw new Error("Could not interpret the sketch.");

        const colorEnhancedPrompt = `${generatedPrompt}, in full vibrant color, high detail`;

        const interpretationMessage: Message = { id: placeholderId, text: `**Interpreted as:** "${generatedPrompt}"`, sender: 'bot', timestamp: new Date().toISOString(), status: 'completed' };
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: c.messages.map(m => m.id === placeholderId ? interpretationMessage : m) } : c));

        const finalBotMessageId = uuidv4();

        if (requestType.startsWith('generate_prompt')) {
            const promptMessage: Message = { id: finalBotMessageId, text: colorEnhancedPrompt, sender: 'bot', timestamp: new Date().toISOString(), status: 'completed' };
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, promptMessage] } : c));
        } else if (requestType.startsWith('generate_image')) {
            const placeholder = createPlaceholderMessage(finalBotMessageId, CHAT_MODES.find(m => m.id === 'image_creator')!, colorEnhancedPrompt);
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, placeholder] } : c));
            
            const imageUrl = await generateImageResponse(colorEnhancedPrompt);
            const imageMessage: Message = { id: finalBotMessageId, text: '', sender: 'bot', timestamp: new Date().toISOString(), imageUrl, status: 'completed' };
            const newAsset: Asset = { id: finalBotMessageId, type: 'image', url: imageUrl, prompt: colorEnhancedPrompt, timestamp: new Date().toISOString() };
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: c.messages.map(m => m.id === finalBotMessageId ? imageMessage : m), assets: [...(c.assets || []), newAsset] } : c));
        } else if (requestType.startsWith('generate_video')) {
            const onUpdate = (statusText: string) => { setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: c.messages.map(m => m.id === finalBotMessageId ? { ...m, text: statusText } : m) } : c)); };
            const placeholder = createPlaceholderMessage(finalBotMessageId, CHAT_MODES.find(m => m.id === 'video_creator')!, colorEnhancedPrompt);
             setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: [...c.messages, placeholder] } : c));

            const { videoUrl, audioDescription } = await generateVideo(colorEnhancedPrompt, onUpdate);
            const videoMessage: Message = { id: finalBotMessageId, text: `Here is the video generated from your sketch.\n\n*(Note: Video is silent.)*`, sender: 'bot', timestamp: new Date().toISOString(), videoUrl, audioDescription, status: 'completed' };
            const newAsset: Asset = { id: finalBotMessageId, type: 'video', url: videoUrl, prompt: colorEnhancedPrompt, timestamp: new Date().toISOString() };
            setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: c.messages.map(m => m.id === finalBotMessageId ? videoMessage : m), assets: [...(c.assets || []), newAsset] } : c));
        }
    } catch (error) {
        console.error("Draw & Generate Error:", error);
        const errorText = error instanceof Error ? error.message : "An unexpected error occurred.";
        const errorMessage: Message = { id: placeholderId, text: `**Error:** ${errorText}`, sender: 'bot', timestamp: new Date().toISOString(), status: 'failed' };
        setChats(prev => prev.map(c => c.id === chatId ? { ...c, messages: c.messages.map(m => m.id === placeholderId ? errorMessage : m) } : c));
    } finally {
        setIsSending(false);
    }
  }
  
  const handleRegenerateResponse = (botMessageId: string) => {
    const chat = activeChat;
    if (!chat) return;

    const botMessageIndex = chat.messages.findIndex(m => m.id === botMessageId);
    if (botMessageIndex > 0 && chat.messages[botMessageIndex - 1].sender === 'user') {
        const userMessage = chat.messages[botMessageIndex - 1];
        handleSendMessage(userMessage.text, userMessage.attachment, userMessage.id);
    } else {
        console.warn('Could not find a valid user prompt to regenerate from.');
    }
  };

  const createPlaceholderMessage = (id: string, mode: ChatMode, text: string, attachment?: Attachment, thinkConfig?: ThinkConfig): Message => {
    if (thinkConfig) {
        return { 
            id, 
            text: `Thinking about: "${text}"`, 
            sender: 'bot', 
            timestamp: new Date().toISOString(), 
            status: 'generating', 
            isThinkingLonger: true,
            thinkLongerConfig: thinkConfig
        };
    }
    switch (mode.id) {
      case 'image_creator':
        if (attachment) {
          return { id, text: `Editing image...`, sender: 'bot', timestamp: new Date().toISOString(), status: 'generating' };
        }
        return { id, text: `Creating an image...`, sender: 'bot', timestamp: new Date().toISOString(), status: 'generating' };
      case 'video_creator':
        return { id, text: 'Preparing video generation...', sender: 'bot', timestamp: new Date().toISOString(), status: 'generating' };
      default:
        return { id, text: '', sender: 'bot', timestamp: new Date().toISOString(), status: 'generating' };
    }
  };

  const handleGenerateFromSketch = (type: 'image' | 'video' | 'prompt', attachment: Attachment) => {
    setIsDrawModalOpen(false);
    // Use a special prefix to indicate a sketch generation request
    handleSendMessage(`sketch::generate_${type}`, attachment);
  };

  const ChatArea = (
    <div className="flex flex-col h-full">
        {activeChat ? (
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6" ref={chatContainerRef} onScroll={handleScroll}>
            {activeChat?.messages.map((msg) => (
              <MessageComponent 
                key={msg.id} 
                message={msg}
                onUpdateMessage={handleUpdateMessage}
                onSendMessage={handleSendMessage}
                onRegenerateResponse={handleRegenerateResponse}
                onAddTask={handleAddTask}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          <NewChatScreen 
            onSendMessage={handleSendMessage}
            onModeChange={handleModeChange}
            activeMode={activeMode}
          />
        )}
        <div className="w-full flex-shrink-0">
          <ChatInput
            onSendMessage={handleSendMessage}
            isSending={isSending}
            activeMode={currentChatMode}
            onToggleVoiceMode={handleToggleVoiceMode}
            voiceEndedInfo={voiceEndedInfo}
            onClearVoiceEndedInfo={() => setVoiceEndedInfo(null)}
            onModeChange={handleModeChangeById}
            onDrawSketchClick={() => setIsDrawModalOpen(true)}
          />
        </div>
    </div>
  );

  return (
    <div className="flex-1 flex h-full overflow-hidden">
        <CustomPersonaModal 
            isOpen={isCustomPersonaModalOpen}
            onClose={() => setIsCustomPersonaModalOpen(false)}
        />
        {isVoiceModeOpen && (
            <VoiceMode 
                onClose={handleVoiceModeClose}
                initialHistory={activeChat?.messages || []}
                chatMode={currentChatMode}
                versionId={currentVersionId}
            />
        )}
         {isDrawModalOpen && (
            <DrawView
                isOpen={isDrawModalOpen}
                onClose={() => setIsDrawModalOpen(false)}
                onGenerate={handleGenerateFromSketch}
                isSending={isSending}
            />
        )}
      {isCanvasMode && activeChat ? (
            <CanvasView
                key={activeChat.id}
                activeChat={activeChat}
                setChats={setChats}
                currentVersionId={currentVersionId}
            />
       ) : isDocumentMode && activeChat ? (
            <DocumentView activeChat={activeChat} key={activeChat.id}>
              {ChatArea}
            </DocumentView>
       ) : isWebsiteMode && activeChat ? (
        <React.Fragment key={activeChat.id}>
          {/* Desktop/Tablet (side-by-side) */}
          <div className="hidden md:flex w-2/5 flex-col h-full border-r border-slate-700/50">
            {ChatArea}
          </div>
          <div className="hidden md:flex w-3/5 h-full">
            <WebsiteCreatorView 
                activeChat={activeChat}
                onSendMessage={handleSendMessage}
                isSending={isSending}
                setChats={setChats}
            />
          </div>

          {/* Mobile (tabbed) */}
          <div className="flex flex-col w-full h-full md:hidden">
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-white/10 h-[57px] bg-black/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-black/30 rounded-full">
                  <button onClick={() => setWebsiteViewTab('chat')} className={`px-3 py-1 text-sm rounded-full flex items-center gap-2 ${websiteViewTab === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>
                    <MessageSquareIcon className="w-4 h-4"/> Chat
                  </button>
                  <button onClick={() => setWebsiteViewTab('editor')} className={`px-3 py-1 text-sm rounded-full flex items-center gap-2 ${websiteViewTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>
                    <CodeXmlIcon className="w-4 h-4"/> Editor
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {websiteViewTab === 'chat' && ChatArea}
              {websiteViewTab === 'editor' && 
                <WebsiteCreatorView 
                    activeChat={activeChat}
                    onSendMessage={handleSendMessage}
                    isSending={isSending}
                    setChats={setChats}
                />
              }
            </div>
          </div>
        </React.Fragment>
      ) : isWriterMode && activeChat ? (
        <React.Fragment key={activeChat.id}>
          {/* Desktop/Tablet (side-by-side) */}
          <div className="hidden md:flex w-2/5 flex-col h-full border-r border-slate-700/50">
            {ChatArea}
          </div>
          <div className="hidden md:flex w-3/5 h-full">
            <WriterView 
                activeChat={activeChat}
                setChats={setChats}
            />
          </div>

          {/* Mobile (tabbed) */}
          <div className="flex flex-col w-full h-full md:hidden">
            <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-white/10 h-[57px] bg-black/20 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-black/30 rounded-full">
                  <button onClick={() => setWebsiteViewTab('chat')} className={`px-3 py-1 text-sm rounded-full flex items-center gap-2 ${websiteViewTab === 'chat' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>
                    <MessageSquareIcon className="w-4 h-4"/> Chat
                  </button>
                  <button onClick={() => setWebsiteViewTab('editor')} className={`px-3 py-1 text-sm rounded-full flex items-center gap-2 ${websiteViewTab === 'editor' ? 'bg-blue-600 text-white' : 'text-slate-300'}`}>
                    <PenLineIcon className="w-4 h-4"/> Document
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-hidden">
              {websiteViewTab === 'chat' && ChatArea}
              {websiteViewTab === 'editor' && 
                <WriterView 
                    activeChat={activeChat}
                    setChats={setChats}
                />
              }
            </div>
          </div>
        </React.Fragment>
      ) : (
        <div className="flex flex-col h-full flex-1">
          {ChatArea}
        </div>
      )}
    </div>
  );
};

export default ChatWindow;