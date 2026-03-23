import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { Conversation, ConversationMessage } from '../types/conversation';

const getTauriErrorMessage = (err: unknown, fallback: string): string => {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message || fallback;
  if (err && typeof err === 'object') {
    const anyErr = err as any;
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) return anyErr.message;
    if (typeof anyErr.error === 'string' && anyErr.error.trim()) return anyErr.error;
    try {
      return JSON.stringify(anyErr);
    } catch {
      return fallback;
    }
  }
  return fallback;
};

interface ConversationContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  
  // 会话操作
  createConversation: (title: string) => Promise<string>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, opts?: { displayContent?: string }) => Promise<void>;
  cancelCurrentSend: () => void;
  deleteConversation: (id: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  setCurrentConversation: (conversation: Conversation | null) => void;
}

const ConversationContext = createContext<ConversationContextType | undefined>(undefined);

export const useConversation = () => {
  const context = useContext(ConversationContext);
  if (context === undefined) {
    throw new Error('useConversation must be used within a ConversationProvider');
  }
  return context;
};

interface ConversationProviderProps {
  children: ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }) => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeSendTokenRef = React.useRef(0);
  const activeStreamUnlistenRef = React.useRef<null | (() => void)>(null);
  const activeStreamErrorUnlistenRef = React.useRef<null | (() => void)>(null);
  const activeStreamEndUnlistenRef = React.useRef<null | (() => void)>(null);

  const cancelCurrentSend = () => {
    // Soft-cancel: bump token so any in-flight send will be ignored when it resolves.
    activeSendTokenRef.current += 1;
    setIsLoading(false);

    // Best-effort: stop receiving stream events.
    try {
      activeStreamUnlistenRef.current?.();
      activeStreamErrorUnlistenRef.current?.();
      activeStreamEndUnlistenRef.current?.();
    } catch {
      // ignore
    } finally {
      activeStreamUnlistenRef.current = null;
      activeStreamErrorUnlistenRef.current = null;
      activeStreamEndUnlistenRef.current = null;
    }
  };

  // 创建新会话
  const createConversation = async (title: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const conversationId = await invoke<string>('conversation_create', { title });
      await refreshConversations();
      return conversationId;
    } catch (err) {
      console.error('创建会话失败(原始错误):', err);
      const errorMessage = getTauriErrorMessage(err, '创建会话失败');
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 加载会话
  const loadConversation = async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const conversation = await invoke<Conversation>('conversation_get', { conversationId: id });
      setCurrentConversation(conversation);
    } catch (err) {
      console.error('加载会话失败(原始错误):', err);
      const errorMessage = getTauriErrorMessage(err, '加载会话失败');
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 发送消息
  const sendMessage = async (content: string, opts?: { displayContent?: string }): Promise<void> => {
    const token = ++activeSendTokenRef.current;
    const requestId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    // Ensure a conversation exists (avoid relying on async React state updates).
    let conversation = currentConversation;
    if (!conversation) {
      const conversationId = await invoke<string>('conversation_create', { title: '新的对话' });
      conversation = await invoke<Conversation>('conversation_get', { conversationId });
      setCurrentConversation(conversation);
      await refreshConversations();
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // 立即添加用户消息到界面（乐观更新）
      const userMessage: ConversationMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: typeof opts?.displayContent === 'string' ? opts.displayContent : content,
        timestamp: Date.now() / 1000,
      };

      const assistantMessageId = (Date.now() + 1).toString();
      const assistantPlaceholder: ConversationMessage = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: Date.now() / 1000,
      };

      const updatedConversation = {
        ...conversation,
        messages: [...conversation.messages, userMessage, assistantPlaceholder],
        updated_at: Date.now() / 1000,
      };
      setCurrentConversation(updatedConversation);

      // Cleanup previous stream listeners if any
      cancelCurrentSend();
      // Note: cancelCurrentSend bumps token; restore the intended token for this send.
      activeSendTokenRef.current = token;

      // Attach stream listeners
      activeStreamUnlistenRef.current = await listen<any>('conversation-chat-chunk', (event) => {
        const payload = (event as any).payload as any;
        if (!payload || payload.request_id !== requestId) return;
        if (token !== activeSendTokenRef.current) return;

        const piece = typeof payload.content === 'string' ? payload.content : String(payload.content ?? '');
        if (!piece) return;

        setCurrentConversation((prev) => {
          if (!prev || prev.id !== updatedConversation.id) return prev;
          const idx = prev.messages.findIndex((m) => m.id === assistantMessageId);
          if (idx < 0) return prev;
          const nextMsgs = prev.messages.slice();
          nextMsgs[idx] = { ...nextMsgs[idx], content: (nextMsgs[idx].content || '') + piece };
          return { ...prev, messages: nextMsgs, updated_at: Date.now() / 1000 };
        });
      });

      activeStreamErrorUnlistenRef.current = await listen<any>('conversation-chat-error', (event) => {
        const payload = (event as any).payload as any;
        if (!payload || payload.request_id !== requestId) return;
        if (token !== activeSendTokenRef.current) return;
        const msg = typeof payload.error === 'string' ? payload.error : 'AI 流式输出失败';
        setError(msg);
      });

      activeStreamEndUnlistenRef.current = await listen<any>('conversation-chat-end', (event) => {
        const payload = (event as any).payload as any;
        if (!payload || payload.request_id !== requestId) return;
        if (token !== activeSendTokenRef.current) return;
        setIsLoading(false);
        void refreshConversations();
      });

      // Start streaming on backend
      await invoke('conversation_send_message_stream', {
        conversationId: updatedConversation.id,
        content,
        requestId,
      });

      // If canceled while waiting, ignore the completion.
      if (token !== activeSendTokenRef.current) {
        return;
      }

      // Streaming will finalize messages via state updates; nothing else to do here.
      return;

    } catch (err) {
      console.error('发送消息失败(原始错误):', err);
      const errorMessage = getTauriErrorMessage(err, '发送消息失败');
      setError(errorMessage);
      
      // 如果发送失败，回滚乐观更新
      if (token === activeSendTokenRef.current) {
        if (conversation) {
          await loadConversation(conversation.id);
        }
      }
      // Fallback: try non-stream send once
      try {
        const response = await invoke('conversation_send_message', {
          conversationId: currentConversation?.id,
          content,
        });

        if (token === activeSendTokenRef.current && currentConversation) {
          const assistantMessage: ConversationMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: (response as any).choices?.[0]?.message?.content || '抱歉，我无法回答这个问题。',
            timestamp: Date.now() / 1000,
            metadata: {
              tokens_used: (response as any).usage?.total_tokens,
              model: (response as any).model,
            },
          };

          setCurrentConversation((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              messages: [...prev.messages, assistantMessage],
              updated_at: Date.now() / 1000,
            };
          });
          await refreshConversations();
        }
      } catch (fallbackErr) {
        console.error('发送消息fallback失败(原始错误):', fallbackErr);
      }
      throw new Error(errorMessage);
    } finally {
      if (token === activeSendTokenRef.current) {
        // If stream is active, loading is ended by end event.
        // For fallback/non-stream, we ensure it is stopped here.
        setIsLoading(false);
      }
    }
  };

  // 删除会话
  const deleteConversation = async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('conversation_delete', { conversationId: id });
      
      // 从列表中移除
      setConversations(prev => prev.filter(conv => conv.id !== id));
      
      // 如果删除的是当前会话，清空当前会话
      if (currentConversation?.id === id) {
        setCurrentConversation(null);
      }
    } catch (err) {
      console.error('删除会话失败(原始错误):', err);
      const errorMessage = getTauriErrorMessage(err, '删除会话失败');
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 刷新会话列表
  const refreshConversations = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const conversationList = await invoke<Conversation[]>('conversation_list');
      setConversations(conversationList.sort((a, b) => b.updated_at - a.updated_at));
    } catch (err) {
      console.error('刷新会话列表失败(原始错误):', err);
      const errorMessage = getTauriErrorMessage(err, '刷新会话列表失败');
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 初始化时加载会话列表
  useEffect(() => {
    refreshConversations();
  }, []);

  const value: ConversationContextType = {
    conversations,
    currentConversation,
    isLoading,
    error,
    createConversation,
    loadConversation,
    sendMessage,
    cancelCurrentSend,
    deleteConversation,
    refreshConversations,
    setCurrentConversation,
  };

  return (
    <ConversationContext.Provider value={value}>
      {children}
    </ConversationContext.Provider>
  );
};
