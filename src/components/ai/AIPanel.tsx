import { useState, useEffect } from 'react';
import { Bot, Sparkles, Code, FileText, CheckCircle, AlertTriangle, Settings, Plus, Clock, ArrowLeft, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';
import { ConversationProvider, useConversation } from '../../contexts/ConversationContext';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

// AI 面板内部组件（使用会话上下文）
const AIPanelInner: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'decompose'>('chat');
  const [showHistory, setShowHistory] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  const { 
    createConversation,
    conversations,
    currentConversation,
    loadConversation,
    sendMessage,
    cancelCurrentSend,
    deleteConversation,
    isLoading: isConversationLoading
  } = useConversation();

  // 检查 AI 配置
  const checkAIConfig = async () => {
    try {
      const config = await invoke('ai_get_config');
      console.log('AI 配置检查结果:', config);
      if (!config) {
        setIsConfigured(false);
      } else {
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('配置检查错误:', error);
      setIsConfigured(false);
    }
  };

  useEffect(() => {
    checkAIConfig();
  }, []);

  // 创建新会话
  const handleNewConversation = async () => {
    try {
      const conversationId = await createConversation('新的对话');
      await loadConversation(conversationId);
      setShowHistory(false);
    } catch (error) {
      console.error('创建会话失败:', error);
    }
  };

  // 选择会话
  const handleSelectConversation = async (id: string) => {
    try {
      await loadConversation(id);
      setShowHistory(false);
    } catch (error) {
      console.error('加载会话失败:', error);
    }
  };

  // 删除会话
  const handleDeleteConversation = async (id: string) => {
    try {
      await deleteConversation(id);
    } catch (error) {
      console.error('删除会话失败:', error);
    }
  };

  // 发送消息
  const handleSendMessage = async () => {
    if (!input.trim() || isConversationLoading) return;

    const messageContent = input.trim();
    setInput(''); // 立即清空输入框

    try {
      await sendMessage(messageContent);
    } catch (error) {
      console.error('发送消息失败:', error);
      // 如果发送失败，恢复输入框内容
      setInput(messageContent);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeTab === 'chat') {
        handleSendMessage();
      } else if (activeTab === 'decompose') {
        decomposeRequirement();
      }
    }
  };

  // 确保 activeTab 类型正确
  const isChatTab = activeTab === 'chat';
  const isDecomposeTab = activeTab === 'decompose';

  const handleStop = () => {
    cancelCurrentSend();
  };

  // 如果显示历史记录
  if (showHistory) {
    return (
      <div className="flex flex-col h-full bg-white">
        {/* 头部 */}
        <div className="flex items-center gap-3 p-3 border-b border-gray-200">
          <button
            onClick={() => setShowHistory(false)}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="font-semibold text-gray-900">会话历史</h3>
        </div>

        {/* 会话列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {conversations.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <Clock className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">还没有会话历史</p>
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  onClick={() => handleSelectConversation(conversation.id)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors ${
                    currentConversation?.id === conversation.id
                      ? 'bg-blue-100 border border-blue-200'
                      : 'bg-white hover:bg-gray-50 border border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-gray-900 truncate">
                        {conversation.title}
                      </h4>
                      <p className="text-xs text-gray-500 mt-1">
                        {conversation.messages.length} 条消息 · {new Date(conversation.updated_at * 1000).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conversation.id);
                      }}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // 如果 AI 未配置，显示配置提示
  if (isConfigured === false) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 text-amber-500" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">AI 服务未配置</h3>
            <p className="text-gray-600 mb-4">
              请先配置 AI 服务才能使用聊天功能。
            </p>
            <div className="text-left bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-900 mb-2">配置步骤：</p>
              <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                <li>在 <code className="bg-gray-200 px-1 rounded">src-tauri/.env</code> 文件中添加配置</li>
                <li>重启应用</li>
                <li>重新尝试</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 如果还在检查配置中，显示加载状态
  if (isConfigured === null) {
    return (
      <div className="flex flex-col h-full bg-white">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">正在检查 AI 配置...</p>
          </div>
        </div>
      </div>
    );
  }

  // 原有的任务拆解功能（保持不变）
  const decomposeRequirement = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      console.log('🔍 开始任务拆解:', input);
      
      // 1. 分析需求
      console.log('📋 步骤1: 分析需求');
      const requirement = await invoke('analyze_requirement', {
        requirementText: input,
        projectContext: {
          project_root: '',
          project_type: 'web',
          tech_stack: ['rust', 'typescript', 'react'],
          existing_files: [],
          dependencies: []
        }
      });
      console.log('✅ 需求分析结果:', requirement);

      // 2. 拆解任务
      console.log('📋 步骤2: 拆解任务');
      const tasks = await invoke('simple_decompose_requirement', {
        requirement: requirement
      });
      console.log('✅ 任务拆解结果:', tasks);

      // 格式化任务拆解结果
      const taskList = tasks as any[];
      let taskContent = `📋 **任务拆解结果**\n\n`;
      
      taskList.forEach((task, index) => {
        taskContent += `## 任务 ${index + 1}: ${task.title}\n`;
        taskContent += `- **类型**: ${task.task_type}\n`;
        taskContent += `- **优先级**: ${task.priority}\n`;
        taskContent += `- **预估时间**: ${task.estimated_time} 分钟\n`;
        taskContent += `- **描述**: ${task.description}\n`;
        taskContent += `- **需要文件**: ${task.required_files.join(', ')}\n`;
        taskContent += `- **验收标准**: ${task.acceptance_criteria.join(', ')}\n\n`;
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: taskContent,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('❌ 任务拆解错误:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **任务拆解失败**

抱歉，任务拆解时出现错误。

🔍 **错误详情**：
\`\`\`
${error}
\`\`\`

💡 **可能原因**：
- 需求描述不够清晰
- 后端服务异常
- 网络连接问题

📝 **建议**：
请尝试更详细地描述您的需求，例如：
- "创建一个用户管理系统，包括登录、注册、权限管理"
- "开发一个电商后台，包含商品管理、订单处理、数据统计"

请重新尝试或修改需求描述。`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 标题栏 - 带新建和历史按钮 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          {isChatTab && (
            <>
              <button
                onClick={handleNewConversation}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="新建会话"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                title="会话历史"
              >
                <Clock className="w-4 h-4" />
              </button>
            </>
          )}
          {!isConfigured && (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">未配置</span>
            </div>
          )}
          {isConfigured && (
            <div className="flex items-center gap-1 text-green-600">
              <CheckCircle className="w-4 h-4" />
              <span className="text-xs">已连接</span>
            </div>
          )}
          <button
            onClick={checkAIConfig}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="重新检查配置"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 标签页 */}
      <div className="flex border-b border-gray-200">
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            isChatTab
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('chat')}
        >
          <div className="flex items-center justify-center gap-2">
            <Sparkles className="w-4 h-4" />
            AI 聊天
          </div>
        </button>
        <button
          className={`flex-1 px-3 py-2 text-sm font-medium ${
            isDecomposeTab
              ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
              : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
          }`}
          onClick={() => setActiveTab('decompose')}
        >
          <div className="flex items-center justify-center gap-2">
            <FileText className="w-4 h-4" />
            任务拆解
          </div>
        </button>
      </div>

      {/* 主内容区域 */}
      {isChatTab ? (
        // AI 聊天界面
        <>
          {/* 当前会话信息 */}
          {currentConversation && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentConversation.title}
              </p>
              <p className="text-xs text-gray-500">
                {currentConversation.messages.length} 条消息
              </p>
            </div>
          )}

          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {!currentConversation ? (
              <div className="text-center text-gray-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">点击右上角 + 创建新会话开始对话</p>
              </div>
            ) : currentConversation.messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">开始与 GoPilot 代码助手对话吧！</p>
              </div>
            ) : (
              currentConversation.messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-sm">
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              code: ({node, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '')
                                const isInline = !props['data-inline'] && !className?.includes('language-')
                                return !isInline && match ? (
                                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                ) : (
                                  <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              pre: ({children}) => (
                                <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                  {children}
                                </pre>
                              ),
                              blockquote: ({children}) => (
                                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600">
                                  {children}
                                </blockquote>
                              ),
                              table: ({children}) => (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full border-collapse border border-gray-300">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({children}) => (
                                <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold">
                                  {children}
                                </th>
                              ),
                              td: ({children}) => (
                                <td className="border border-gray-300 px-4 py-2">
                                  {children}
                                </td>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {new Date(message.timestamp * 1000).toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">U</span>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}

            {isConversationLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={currentConversation ? "输入消息..." : "请先创建会话"}
                disabled={isConversationLoading}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                onClick={isConversationLoading ? handleStop : handleSendMessage}
                disabled={(!input.trim() && !isConversationLoading)}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isConversationLoading ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </>
      ) : (
        // 任务拆解界面（保持原有功能）
        <>
          {/* 消息列表 */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 py-8">
                <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm">输入需求，AI 将为您拆解为具体任务。</p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${
                    message.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {message.role === 'assistant' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                      <Bot className="w-4 h-4 text-blue-600" />
                    </div>
                  )}
                  
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="text-sm">
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                            components={{
                              code: ({node, className, children, ...props}: any) => {
                                const match = /language-(\w+)/.exec(className || '')
                                const isInline = !props['data-inline'] && !className?.includes('language-')
                                return !isInline && match ? (
                                  <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                    <code className={className} {...props}>
                                      {children}
                                    </code>
                                  </pre>
                                ) : (
                                  <code className="bg-gray-200 text-gray-800 px-1 py-0.5 rounded text-sm" {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              pre: ({children}) => (
                                <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
                                  {children}
                                </pre>
                              ),
                              blockquote: ({children}) => (
                                <blockquote className="border-l-4 border-blue-500 pl-4 italic text-gray-600">
                                  {children}
                                </blockquote>
                              ),
                              table: ({children}) => (
                                <div className="overflow-x-auto">
                                  <table className="min-w-full border-collapse border border-gray-300">
                                    {children}
                                  </table>
                                </div>
                              ),
                              th: ({children}) => (
                                <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-semibold">
                                  {children}
                                </th>
                              ),
                              td: ({children}) => (
                                <td className="border border-gray-300 px-4 py-2">
                                  {children}
                                </td>
                              ),
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      )}
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                  
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                      <span className="text-white text-sm font-medium">U</span>
                    </div>
                  )}
                </div>
              ))
            )}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-blue-600" />
                </div>
                <div className="bg-gray-100 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 输入区域 */}
          <div className="border-t border-gray-200 p-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="输入需求，AI 将为您拆解为具体任务..."
                disabled={isLoading}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              <button
                onClick={decomposeRequirement}
                disabled={isLoading || !input.trim()}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Code className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2 text-xs text-gray-500">
              💡 提示：输入需求后，AI 将自动拆解为具体的开发任务
            </div>
          </div>
        </>
      )}
    </div>
  );
};

// 主 AI 面板组件
const AIPanel: React.FC = () => {
  return (
    <ConversationProvider>
      <AIPanelInner />
    </ConversationProvider>
  );
};

export default AIPanel;
