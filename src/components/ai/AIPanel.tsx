import { useState, useEffect } from 'react';
import { Send, Bot, Sparkles, Code, FileText, CheckCircle, AlertTriangle, Settings } from 'lucide-react';
import { invoke } from '@tauri-apps/api/tauri';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface TaskDecompositionResult {
  id: string;
  title: string;
  description: string;
  task_type: string;
  priority: string;
  estimated_time: number;
  required_files: string[];
  acceptance_criteria: string[];
}

export default function AIPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'decompose'>('chat');
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);

  // 检查 AI 配置
  useEffect(() => {
    checkAIConfig();
  }, []);

  const checkAIConfig = async () => {
    try {
      const config = await invoke('ai_get_config');
      console.log('AI 配置检查结果:', config);
      
      if (!config) {
        setIsConfigured(false);
      } else {
        // 对于 Ollama，只要有基本配置就认为已配置
        setIsConfigured(true);
      }
    } catch (error) {
      console.error('配置检查错误:', error);
      setIsConfigured(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    // 检查 AI 配置
    if (!isConfigured) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `⚠️ **AI 服务未配置**

请先配置 AI 服务才能使用聊天功能。

📋 **配置步骤**：
1. 在 \`src-tauri/.env\` 文件中添加 AI 配置
2. 重启应用
3. 重新尝试

💡 **推荐配置**（阿里云通义千问）：
\`\`\`env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=your-api-key-here
AI_MODEL=qwen-turbo
\`\`\`

📖 详细配置指南请查看文档。`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
      return;
    }

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
      // 获取 AI 配置以使用正确的模型
      const config = await invoke('ai_get_config');
      const model = (config as any)?.model || 'gpt-3.5-turbo';
      
      // 调用后端 AI 聊天接口
      const response = await invoke('ai_chat', {
        request: {
          model: model,
          messages: [
            { role: 'system', content: '你是GoPilot代码助手，一个专业的编程助手，帮助用户解决编程问题。请用中文回答，并在回答中体现你是 GoPilot 代码助手的身份。' },
            { role: 'user', content: input }
          ],
          temperature: 0.7,
          max_tokens: 1000,
          stream: false
        }
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: (response as any).choices?.[0]?.message?.content || '抱歉，我无法回答这个问题。',
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AI chat error:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ **连接失败**

抱歉，连接 AI 服务时出现错误。

🔍 **可能原因**：
- API 密钥无效或已过期
- 网络连接问题
- AI 服务暂时不可用
- 配置文件格式错误

💡 **解决方案**：
1. 检查 \`src-tauri/.env\` 文件中的配置
2. 确认 API 密钥正确且有效
3. 检查网络连接
4. 重启应用后重试

📖 详细配置指南请查看项目文档。`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const decomposeRequirement = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `任务拆解需求：${input}`,
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
      const taskList = tasks as TaskDecompositionResult[];
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

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (activeTab === 'chat') {
        sendMessage();
      } else {
        decomposeRequirement();
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">AI Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          {isConfigured === false && (
            <div className="flex items-center gap-1 text-amber-600">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-xs">未配置</span>
            </div>
          )}
          {isConfigured === true && (
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
            activeTab === 'chat'
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
            activeTab === 'decompose'
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

      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 py-8">
            <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm">
              {activeTab === 'chat' 
                ? '开始与 AI 助手对话吧！' 
                : '输入需求，AI 将为您拆解为具体任务。'
              }
            </p>
          </div>
        )}
        
        {messages.map((message) => (
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
        ))}
        
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
            placeholder={
              activeTab === 'chat' 
                ? '输入您的问题...' 
                : '输入需求描述，例如：创建一个用户管理系统'
            }
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isLoading}
          />
          <button
            onClick={activeTab === 'chat' ? sendMessage : decomposeRequirement}
            disabled={isLoading || !input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {activeTab === 'chat' ? (
              <Send className="w-4 h-4" />
            ) : (
              <Code className="w-4 h-4" />
            )}
          </button>
        </div>
        {activeTab === 'decompose' && (
          <div className="mt-2 text-xs text-gray-500">
            💡 提示：输入需求后，AI 将自动拆解为具体的开发任务
          </div>
        )}
      </div>
    </div>
  );
}
