use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::pin::Pin;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::RwLock;
use uuid::Uuid;

use futures_util::StreamExt;

use crate::ai::{AiConfig, AiError, ChatMessage, ChatRequest, ChatResponse, ChatStreamChunk, create_ai_client};

fn estimate_tokens_from_text(s: &str) -> u32 {
    // Very rough heuristic: ~4 chars per token for mixed English/Chinese.
    let chars = s.chars().count() as u32;
    std::cmp::max(1, chars / 4)
}

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
        if !self.config.auto_summarize {
            if self.messages.len() > self.config.max_messages {
                self.messages.remove(0);
            }
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

        // Add rolling summary as system context (if present).
        if let Some(summary) = &self.summary {
            if !summary.trim().is_empty() {
                messages.push(ChatMessage {
                    role: "system".to_string(),
                    content: format!("Rolling summary (auto-generated):\n{}", summary),
                });
            }
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

        println!(
            "🔗 AI 请求配置: provider={:?}, base_url={}, model={}",
            conversation.ai_config.provider,
            conversation.ai_config.base_url,
            conversation.ai_config.model
        );
        
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

        // Best-effort auto summarization after assistant reply.
        let auto_sum = conversation.config.auto_summarize;
        let conv_id = conversation.id.clone();
        drop(conversations);
        if auto_sum {
            let _ = self.maybe_auto_summarize(&conv_id).await;
        }
        
        Ok(response)
    }

    async fn maybe_auto_summarize(&self, conversation_id: &str) -> Result<(), String> {
        // Phase 1: check + snapshot under lock
        let (ai_config, model, max_tokens, memory_window, existing_summary, snapshot_msgs) = {
            let mut conversations = self.conversations.write().await;
            let conversation = conversations
                .get_mut(conversation_id)
                .ok_or("会话不存在")?;

            if !conversation.config.auto_summarize {
                return Ok(());
            }

            let msg_count = conversation.messages.len();
            let max_messages = conversation.config.max_messages;
            let max_tokens = conversation.config.max_tokens;
            let memory_window = conversation.config.memory_window;

            let mut est_tokens: u32 = 0;
            for m in &conversation.messages {
                if let Some(meta) = &m.metadata {
                    if let Some(t) = meta.tokens_used {
                        est_tokens = est_tokens.saturating_add(t);
                        continue;
                    }
                }
                est_tokens = est_tokens.saturating_add(estimate_tokens_from_text(&m.content));
            }

            let token_threshold = ((max_tokens as f32) * 0.8) as u32;
            let needs = msg_count > max_messages || est_tokens > token_threshold;
            if !needs {
                return Ok(());
            }

            if msg_count <= memory_window + 2 {
                return Ok(());
            }

            let summarize_upto = msg_count.saturating_sub(memory_window);
            if summarize_upto == 0 {
                return Ok(());
            }

            let to_sum = conversation.messages[..summarize_upto].to_vec();
            (
                conversation.ai_config.clone(),
                conversation.ai_config.model.clone(),
                max_tokens,
                memory_window,
                conversation.summary.clone().unwrap_or_default(),
                to_sum,
            )
        };

        // Phase 2: summarize without lock
        let mut transcript = String::new();
        for m in &snapshot_msgs {
            transcript.push_str(&format!("[{}] {}\n\n", m.role, m.content));
        }

        let prompt = format!(
            "你是 GoPilot 的滚动摘要器。请把以下对话片段摘要成一个可持续累积的 summary，用于在后续对话中替代原文。\n\n\
要求：\n\
- 保留用户目标、关键决策、重要文件/函数名、未完成事项、已完成事项、已知问题\n\
- 使用分段标题，尽量结构化\n\
- 不要编造不存在的信息\n\n\
现有 summary（可能为空）：\n\
---\n\
{}\n\
---\n\n\
需要摘要的新内容：\n\
---\n\
{}\n\
---\n",
            existing_summary,
            transcript
        );

        let request = ChatRequest {
            model: model.clone(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: Some(0.2),
            max_tokens: Some(std::cmp::min(1200, max_tokens)),
            stream: Some(false),
        };

        let client = create_ai_client(ai_config);
        let response = client
            .chat(request)
            .await
            .map_err(|e| format!("摘要 AI 调用失败: {}", e))?;
        let new_summary = response.choices[0].message.content.clone();

        // Phase 3: apply under lock (re-check size + trim)
        let mut conversations = self.conversations.write().await;
        let conversation = conversations
            .get_mut(conversation_id)
            .ok_or("会话不存在")?;

        // Only apply if auto summarization still enabled.
        if !conversation.config.auto_summarize {
            return Ok(());
        }

        conversation.summary = Some(new_summary);

        // Trim: keep only the last memory_window messages.
        let keep = conversation.config.memory_window;
        if conversation.messages.len() > keep {
            let start = conversation.messages.len() - keep;
            conversation.messages = conversation.messages[start..].to_vec();
        }

        Ok(())
    }

    /// 流式发送消息
    pub async fn send_message_stream(
        &self,
        conversation_id: &str,
        content: String,
        request_id: String,
        window: tauri::Window,
    ) -> Result<(), String> {
        #[derive(Serialize, Clone)]
        struct StreamPayload {
            request_id: String,
            content: String,
        }

        #[derive(Serialize, Clone)]
        struct EndPayload {
            request_id: String,
        }

        #[derive(Serialize, Clone)]
        struct ErrorPayload {
            request_id: String,
            error: String,
        }

        // Phase 1: write-lock only for updating conversation + building request
        let (request, ai_config) = {
            let mut conversations = self.conversations.write().await;
            let conversation = conversations
                .get_mut(conversation_id)
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

            let context_messages = conversation.get_context_messages();
            let req = ChatRequest {
                model: conversation.ai_config.model.clone(),
                messages: context_messages,
                temperature: Some(0.7),
                max_tokens: Some(conversation.config.max_tokens),
                stream: Some(true),
            };
            (req, conversation.ai_config.clone())
        };

        // Phase 2: stream without holding the lock
        let client = create_ai_client(ai_config);
        let stream: Pin<Box<dyn futures_util::Stream<Item = Result<ChatStreamChunk, AiError>> + Send>> =
            client.chat_stream(request).await.map_err(|e| format!("AI 调用失败: {}", e))?;

        let mut stream = stream;
        let mut assistant_content = String::new();
        let start_time = SystemTime::now();

        while let Some(chunk_result) = stream.next().await {
            match chunk_result {
                Ok(chunk) => {
                    if let Some(choice) = chunk.choices.first() {
                        if let Some(content_piece) = &choice.delta.content {
                            assistant_content.push_str(content_piece);
                            let _ = window.emit(
                                "conversation-chat-chunk",
                                StreamPayload {
                                    request_id: request_id.clone(),
                                    content: content_piece.to_string(),
                                },
                            );
                        }
                    }
                }
                Err(e) => {
                    let _ = window.emit(
                        "conversation-chat-error",
                        ErrorPayload {
                            request_id: request_id.clone(),
                            error: e.to_string(),
                        },
                    );
                    return Err(format!("AI 流式调用失败: {}", e));
                }
            }
        }

        // Phase 3: write-lock again to append assistant message
        {
            let mut conversations = self.conversations.write().await;
            let conversation = conversations
                .get_mut(conversation_id)
                .ok_or("会话不存在")?;

            let response_time_ms = start_time
                .elapsed()
                .unwrap_or_default()
                .as_millis() as u64;

            let assistant_message = ConversationMessage {
                id: Uuid::new_v4().to_string(),
                role: "assistant".to_string(),
                content: assistant_content,
                timestamp: SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                metadata: Some(MessageMetadata {
                    tokens_used: None,
                    model: Some(conversation.ai_config.model.clone()),
                    response_time_ms: Some(response_time_ms),
                }),
            };

            conversation.add_message(assistant_message);
        }

        // Best-effort auto summarization after assistant reply.
        // Run outside the lock.
        let _ = self.maybe_auto_summarize(conversation_id).await;

        let _ = window.emit(
            "conversation-chat-end",
            EndPayload {
                request_id: request_id.clone(),
            },
        );
        Ok(())
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
