export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    tokens_used?: number;
    model?: string;
    response_time_ms?: number;
  };
}

export interface ConversationConfig {
  max_messages: number;
  max_tokens: number;
  system_prompt?: string;
  memory_window: number;
  auto_summarize: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: number;
  updated_at: number;
  messages: ConversationMessage[];
  config: ConversationConfig;
  ai_config: {
    provider: 'OpenAI' | 'Ollama';
    base_url: string;
    api_key?: string;
    model: string;
  };
  summary?: string;
  is_archived: boolean;
}

export interface ConversationStats {
  total_messages: number;
  user_messages: number;
  assistant_messages: number;
  total_tokens: number;
  last_activity: number;
}
