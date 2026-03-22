use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::ai::{ChatMessage, ChatRequest, ChatResponse, AiConfig, create_ai_client};

/// 会话消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationMessage {
    pub id: String,
    pub role: String, // "user", "assistant", "system"
    pub content: String,
    pub timestamp: u64,
    pub metadata: Option<MessageMetadata>,
}

/// 消息元数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageMetadata {
    pub tokens_used: Option<u32>,
    pub model: Option<String>,
    pub response_time_ms: Option<u64>,
}

/// 会话配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationConfig {
    pub max_messages: usize,        // 最大消息数量
    pub max_tokens: u32,            // 最大 token 数
    pub system_prompt: Option<String>, // 系统提示词
    pub memory_window: usize,       // 记忆窗口大小
    pub auto_summarize: bool,       // 自动总结
}

impl Default for ConversationConfig {
    fn default() -> Self {
        Self {
            max_messages: 50,
            max_tokens: 8000,
            system_prompt: Some("你是GoPilot代码助手，一个专业的编程助手，帮助用户解决编程问题。请用中文回答，并在回答中体现你是 GoPilot 代码助手的身份。".to_string()),
            memory_window: 20,
            auto_summarize: true,
        }
    }
}

/// 会话信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub created_at: u64,
    pub updated_at: u64,
    pub messages: Vec<ConversationMessage>,
    pub config: ConversationConfig,
    pub ai_config: AiConfig,
    pub summary: Option<String>, // 会话总结
    pub is_archived: bool,
}

impl Conversation {
    pub fn new(title: String, ai_config: AiConfig) -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            created_at: now,
            updated_at: now,
            messages: Vec::new(),
            config: ConversationConfig::default(),
            ai_config,
            summary: None,
            is_archived: false,
        }
    }

    /// 添加消息到会话
    pub fn add_message(&mut self, message: ConversationMessage) {
        self.updated_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        
        self.messages.push(message);
        
        // 维护消息数量限制
        if self.messages.len() > self.config.max_messages {
            self.messages.remove(0);
        }
    }

    /// 获取用于 AI 请求的消息历史
    pub fn get_context_messages(&self) -> Vec<ChatMessage> {
        let mut messages = Vec::new();
        
        // 添加系统提示词
        if let Some(system_prompt) = &self.config.system_prompt {
            messages.push(ChatMessage {
                role: "system".to_string(),
                content: system_prompt.clone(),
            });
        }
        
        // 添加记忆窗口内的消息
        let start_index = if self.messages.len() > self.config.memory_window {
            self.messages.len() - self.config.memory_window
        } else {
            0
        };
        
        for msg in &self.messages[start_index..] {
            messages.push(ChatMessage {
                role: msg.role.clone(),
                content: msg.content.clone(),
            });
        }
        
        messages
    }

    /// 获取会话统计信息
    pub fn get_stats(&self) -> ConversationStats {
        let total_messages = self.messages.len();
        let user_messages = self.messages.iter()
            .filter(|m| m.role == "user")
            .count();
        let assistant_messages = self.messages.iter()
            .filter(|m| m.role == "assistant")
            .count();
        
        let total_tokens: u32 = self.messages.iter()
            .filter_map(|m| m.metadata.as_ref()?.tokens_used)
            .sum();
        
        ConversationStats {
            total_messages,
            user_messages,
            assistant_messages,
            total_tokens,
            last_activity: self.updated_at,
        }
    }
}

/// 会话统计信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConversationStats {
    pub total_messages: usize,
    pub user_messages: usize,
    pub assistant_messages: usize,
    pub total_tokens: u32,
    pub last_activity: u64,
}

/// 会话管理器
pub struct ConversationManager {
    conversations: RwLock<HashMap<String, Conversation>>,
    default_ai_config: Option<AiConfig>,
}

impl ConversationManager {
    pub fn new() -> Self {
        Self {
            conversations: RwLock::new(HashMap::new()),
            default_ai_config: None,
        }
    }

    /// 设置默认 AI 配置
    pub async fn set_default_ai_config(&self, config: AiConfig) {
        // 这里应该设置默认配置，但由于结构设计，我们需要重新设计
        // 暂时先不实现，后续优化
    }

    /// 创建新会话
    pub async fn create_conversation(&self, title: String, ai_config: AiConfig) -> Result<String, String> {
        let conversation = Conversation::new(title, ai_config);
        let conversation_id = conversation.id.clone();
        
        let mut conversations = self.conversations.write().await;
        conversations.insert(conversation_id.clone(), conversation);
        
        Ok(conversation_id)
    }

    /// 获取会话
    pub async fn get_conversation(&self, conversation_id: &str) -> Option<Conversation> {
        let conversations = self.conversations.read().await;
        conversations.get(conversation_id).cloned()
    }

    /// 发送消息
    pub async fn send_message(
        &self,
        conversation_id: &str,
        content: String,
    ) -> Result<ChatResponse, String> {
        let mut conversations = self.conversations.write().await;
        
        let conversation = conversations.get_mut(conversation_id)
            .ok_or("会话不存在")?;
        
        // 添加用户消息
        let user_message = ConversationMessage {
            id: Uuid::new_v4().to_string(),
            role: "user".to_string(),
            content: content.clone(),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            metadata: None,
        };
        
        conversation.add_message(user_message);
        
        // 创建 AI 请求
        let context_messages = conversation.get_context_messages();
        let request = ChatRequest {
            model: conversation.ai_config.model.clone(),
            messages: context_messages,
            temperature: Some(0.7),
            max_tokens: Some(conversation.config.max_tokens),
            stream: Some(false),
        };
        
        // 调用 AI
        let start_time = SystemTime::now();
        let client = create_ai_client(conversation.ai_config.clone());
        let response = client.chat(request).await
            .map_err(|e| format!("AI 调用失败: {}", e))?;
        
        let response_time = start_time.elapsed()
            .unwrap_or_default()
            .as_millis() as u64;
        
        // 添加 AI 响应消息
        let assistant_message = ConversationMessage {
            id: Uuid::new_v4().to_string(),
            role: "assistant".to_string(),
            content: response.choices[0].message.content.clone(),
            timestamp: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_secs(),
            metadata: Some(MessageMetadata {
                tokens_used: response.usage.as_ref().map(|u| u.total_tokens),
                model: Some(response.model.clone()),
                response_time_ms: Some(response_time),
            }),
        };
        
        conversation.add_message(assistant_message);
        
        Ok(response)
    }

    /// 获取所有会话列表
    pub async fn list_conversations(&self) -> Vec<Conversation> {
        let conversations = self.conversations.read().await;
        conversations.values()
            .cloned()
            .collect()
    }

    /// 删除会话
    pub async fn delete_conversation(&self, conversation_id: &str) -> Result<(), String> {
        let mut conversations = self.conversations.write().await;
        conversations.remove(conversation_id)
            .ok_or("会话不存在")?;
        Ok(())
    }

    /// 清理旧会话
    pub async fn cleanup_old_conversations(&self, days_old: u64) -> Result<usize, String> {
        let cutoff_time = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs() - (days_old * 24 * 60 * 60);
        
        let mut conversations = self.conversations.write().await;
        let initial_count = conversations.len();
        
        conversations.retain(|_, conv| conv.updated_at >= cutoff_time);
        
        Ok(initial_count - conversations.len())
    }
}

/// 全局会话管理器实例
static CONVERSATION_MANAGER: std::sync::OnceLock<ConversationManager> = std::sync::OnceLock::new();

/// 获取全局会话管理器
pub fn get_conversation_manager() -> &'static ConversationManager {
    CONVERSATION_MANAGER.get_or_init(|| ConversationManager::new())
}
