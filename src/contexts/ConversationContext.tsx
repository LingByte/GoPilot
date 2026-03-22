import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { Conversation, ConversationMessage } from '../types/conversation';

interface ConversationContextType {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  isLoading: boolean;
  error: string | null;
  
  // 会话操作
  createConversation: (title: string) => Promise<string>;
  loadConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
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

  // 创建新会话
  const createConversation = async (title: string): Promise<string> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const conversationId = await invoke<string>('conversation_create', { title });
      await refreshConversations();
      return conversationId;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建会话失败';
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
      const errorMessage = err instanceof Error ? err.message : '加载会话失败';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // 发送消息
  const sendMessage = async (content: string): Promise<void> => {
    if (!currentConversation) {
      throw new Error('没有当前会话');
    }

    setIsLoading(true);
    setError(null);
    
    try {
      // 立即添加用户消息到界面（乐观更新）
      const userMessage: ConversationMessage = {
        id: Date.now().toString(),
        role: 'user',
        content,
        timestamp: Date.now() / 1000,
      };

      const updatedConversation = {
        ...currentConversation,
        messages: [...currentConversation.messages, userMessage],
        updated_at: Date.now() / 1000,
      };
      setCurrentConversation(updatedConversation);

      // 发送到后端
      const response = await invoke('conversation_send_message', {
        conversationId: currentConversation.id,
        content,
      });

      // 添加 AI 响应消息
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

      const finalConversation = {
        ...updatedConversation,
        messages: [...updatedConversation.messages, assistantMessage],
        updated_at: Date.now() / 1000,
      };
      setCurrentConversation(finalConversation);

      // 更新会话列表
      await refreshConversations();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '发送消息失败';
      setError(errorMessage);
      
      // 如果发送失败，回滚乐观更新
      await loadConversation(currentConversation.id);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
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
      const errorMessage = err instanceof Error ? err.message : '删除会话失败';
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
      const errorMessage = err instanceof Error ? err.message : '刷新会话列表失败';
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
