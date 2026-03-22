import React, { useState } from 'react';
import { Plus, Trash2, Clock, CheckCircle } from 'lucide-react';
import { Conversation } from '../../types/conversation';
import { useConversation } from '../../contexts/ConversationContext';

interface ConversationListProps {
  onNewConversation: () => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({ onNewConversation }) => {
  const { 
    conversations, 
    currentConversation, 
    loadConversation, 
    deleteConversation, 
    isLoading 
  } = useConversation();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSelectConversation = async (id: string) => {
    if (id === currentConversation?.id) return;
    
    try {
      await loadConversation(id);
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    if (deletingId === id) return;
    
    setDeletingId(id);
    try {
      await deleteConversation(id);
    } catch (error) {
      console.error('删除会话失败:', error);
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}天前`;
    } else if (diffHours > 0) {
      return `${diffHours}小时前`;
    } else {
      return '刚刚';
    }
  };

  const getLastMessage = (conversation: Conversation) => {
    const messages = conversation.messages;
    if (messages.length === 0) return '暂无消息';
    
    const lastMessage = messages[messages.length - 1];
    const content = lastMessage.content;
    return content.length > 50 ? content.substring(0, 50) + '...' : content;
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 border-r border-gray-200">
      {/* 头部 */}
      <div className="p-4 border-b border-gray-200">
        <button
          onClick={onNewConversation}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建会话
        </button>
      </div>

      {/* 会话列表 */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
            <Plus className="w-12 h-12 mb-3 text-gray-300" />
            <p className="text-sm text-center">还没有会话</p>
            <p className="text-xs text-center mt-1">点击上方按钮创建第一个会话</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                onClick={() => handleSelectConversation(conversation.id)}
                className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                  currentConversation?.id === conversation.id
                    ? 'bg-blue-100 border border-blue-200'
                    : 'bg-white hover:bg-gray-100 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium text-gray-900 truncate">
                      {conversation.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {getLastMessage(conversation)}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {formatTime(conversation.updated_at)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Plus className="w-3 h-3" />
                        {conversation.messages.length}
                      </span>
                    </div>
                  </div>
                  
                  <button
                    onClick={(e) => handleDeleteConversation(e, conversation.id)}
                    disabled={deletingId === conversation.id || isLoading}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-600 transition-all"
                  >
                    {deletingId === conversation.id ? (
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {/* 会话状态指示器 */}
                {currentConversation?.id === conversation.id && (
                  <div className="flex items-center gap-1 mt-2">
                    <CheckCircle className="w-3 h-3 text-blue-600" />
                    <span className="text-xs text-blue-600">当前会话</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      {conversations.length > 0 && (
        <div className="p-3 border-t border-gray-200 bg-white">
          <div className="text-xs text-gray-500 text-center">
            共 {conversations.length} 个会话
          </div>
        </div>
      )}
    </div>
  );
};
