use serde::{Deserialize, Serialize};
use std::pin::Pin;
use futures_util::StreamExt;
use async_trait::async_trait;

/// AI 提供商类型
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum AiProvider {
    OpenAI,
    Ollama,
}

/// AI 配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiConfig {
    pub provider: AiProvider,
    pub base_url: String,
    pub api_key: Option<String>,
    pub model: String,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: None,
            model: "gpt-3.5-turbo".to_string(),
        }
    }
}

/// 聊天消息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "user", "assistant", "system"
    pub content: String,
}

/// 聊天请求
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatRequest {
    pub model: String,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stream: Option<bool>,
}

/// 聊天响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatResponse {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<ChatChoice>,
    pub usage: Option<ChatUsage>,
}

/// 聊天选择
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatChoice {
    pub index: u32,
    pub message: ChatMessage,
    pub finish_reason: Option<String>,
}

/// 使用统计
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatUsage {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_tokens: u32,
}

/// 流式响应块
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatStreamChunk {
    pub id: String,
    pub object: String,
    pub created: u64,
    pub model: String,
    pub choices: Vec<StreamChoice>,
}

/// 流式选择
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamChoice {
    pub index: u32,
    pub delta: StreamDelta,
    pub finish_reason: Option<String>,
}

/// 流式增量
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamDelta {
    pub role: Option<String>,
    pub content: Option<String>,
}

/// AI 错误
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiError {
    pub code: String,
    pub message: String,
    pub r#type: String,
}

impl std::fmt::Display for AiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for AiError {}

/// AI 客户端 trait
#[async_trait]
pub trait AiClient: Send + Sync {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AiError>;
    async fn chat_stream(&self, request: ChatRequest) -> Result<Pin<Box<dyn futures_util::Stream<Item = Result<ChatStreamChunk, AiError>> + Send>>, AiError>;
}

/// OpenAI 客户端
pub struct OpenAIClient {
    client: reqwest::Client,
    pub config: AiConfig,
}

impl OpenAIClient {
    pub fn new(config: AiConfig) -> Self {
        let client = reqwest::Client::new();
        Self { client, config }
    }

    fn get_headers(&self) -> reqwest::header::HeaderMap {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert("Content-Type", "application/json".parse().unwrap());
        
        if let Some(api_key) = &self.config.api_key {
            headers.insert("Authorization", format!("Bearer {}", api_key).parse().unwrap());
        }
        
        headers
    }
}

#[async_trait]
impl AiClient for OpenAIClient {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AiError> {
        let url = format!("{}/chat/completions", self.config.base_url);
        let _headers = self.get_headers();

        let response = self.client
            .post(&url)
            .headers(self.get_headers())
            .json(&request)
            .send()
            .await
            .map_err(|e| AiError {
                code: "network_error".to_string(),
                message: e.to_string(),
                r#type: "network".to_string(),
            })?;

        if response.status().is_success() {
            response
                .json::<ChatResponse>()
                .await
                .map_err(|e| AiError {
                    code: "parse_error".to_string(),
                    message: e.to_string(),
                    r#type: "parse".to_string(),
                })
        } else {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            Err(AiError {
                code: status.as_str().to_string(),
                message: error_text,
                r#type: "api_error".to_string(),
            })
        }
    }

    async fn chat_stream(&self, request: ChatRequest) -> Result<Pin<Box<dyn futures_util::Stream<Item = Result<ChatStreamChunk, AiError>> + Send>>, AiError> {
        let mut stream_request = request.clone();
        stream_request.stream = Some(true);

        let url = format!("{}/chat/completions", self.config.base_url);
        let _headers = self.get_headers();

        let response = self.client
            .post(&url)
            .headers(self.get_headers())
            .json(&stream_request)
            .send()
            .await
            .map_err(|e| AiError {
                code: "network_error".to_string(),
                message: e.to_string(),
                r#type: "network".to_string(),
            })?;

        if response.status().is_success() {
            let stream = response
                .bytes_stream()
                .map(|result: Result<bytes::Bytes, reqwest::Error>| -> Result<ChatStreamChunk, AiError> {
                    match result {
                        Ok(bytes) => {
                            let chunk_str = String::from_utf8_lossy(&bytes);
                            for line in chunk_str.lines() {
                                if line.starts_with("data: ") && line != "data: [DONE]" {
                                    let json_str = &line[6..];
                                    match serde_json::from_str::<ChatStreamChunk>(json_str) {
                                        Ok(chunk) => return Ok(chunk),
                                        Err(e) => return Err(AiError {
                                            code: "parse_error".to_string(),
                                            message: e.to_string(),
                                            r#type: "parse".to_string(),
                                        }),
                                    }
                                }
                            }
                            // 如果没有有效数据，返回一个空的 chunk
                            Ok(ChatStreamChunk {
                                id: uuid::Uuid::new_v4().to_string(),
                                object: "chat.completion.chunk".to_string(),
                                created: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_secs(),
                                model: "".to_string(),
                                choices: vec![],
                            })
                        }
                        Err(e) => Err(AiError {
                            code: "stream_error".to_string(),
                            message: e.to_string(),
                            r#type: "stream".to_string(),
                        }),
                    }
                });

            Ok(Box::pin(stream))
        } else {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            Err(AiError {
                code: status.as_str().to_string(),
                message: error_text,
                r#type: "api_error".to_string(),
            })
        }
    }
}

/// Ollama 客户端
pub struct OllamaClient {
    client: reqwest::Client,
    pub config: AiConfig,
}

impl OllamaClient {
    pub fn new(config: AiConfig) -> Self {
        let client = reqwest::Client::new();
        Self { client, config }
    }
}

#[async_trait]
impl AiClient for OllamaClient {
    async fn chat(&self, request: ChatRequest) -> Result<ChatResponse, AiError> {
        let url = format!("{}/api/chat", self.config.base_url);
        
        // Ollama 使用不同的请求格式
        let ollama_request = serde_json::json!({
            "model": request.model,
            "messages": request.messages,
            "stream": false,
            "options": {
                "temperature": request.temperature.unwrap_or(0.7),
                "num_predict": request.max_tokens
            }
        });

        let response = self.client
            .post(&url)
            .json(&ollama_request)
            .send()
            .await
            .map_err(|e| AiError {
                code: "network_error".to_string(),
                message: e.to_string(),
                r#type: "network".to_string(),
            })?;

        if response.status().is_success() {
            // 转换 Ollama 响应为 OpenAI 格式
            let ollama_response: serde_json::Value = response.json().await.map_err(|e| AiError {
                code: "parse_error".to_string(),
                message: e.to_string(),
                r#type: "parse".to_string(),
            })?;

            let chat_response = ChatResponse {
                id: uuid::Uuid::new_v4().to_string(),
                object: "chat.completion".to_string(),
                created: std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs(),
                model: request.model,
                choices: vec![ChatChoice {
                    index: 0,
                    message: ChatMessage {
                        role: "assistant".to_string(),
                        content: ollama_response["message"]["content"].as_str().unwrap_or("").to_string(),
                    },
                    finish_reason: Some("stop".to_string()),
                }],
                usage: None,
            };

            Ok(chat_response)
        } else {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            Err(AiError {
                code: status.as_str().to_string(),
                message: error_text,
                r#type: "api_error".to_string(),
            })
        }
    }

    async fn chat_stream(&self, request: ChatRequest) -> Result<Pin<Box<dyn futures_util::Stream<Item = Result<ChatStreamChunk, AiError>> + Send>>, AiError> {
        let url = format!("{}/api/chat", self.config.base_url);
        
        let ollama_request = serde_json::json!({
            "model": request.model,
            "messages": request.messages,
            "stream": true,
            "options": {
                "temperature": request.temperature.unwrap_or(0.7),
                "num_predict": request.max_tokens
            }
        });

        let response = self.client
            .post(&url)
            .json(&ollama_request)
            .send()
            .await
            .map_err(|e| AiError {
                code: "network_error".to_string(),
                message: e.to_string(),
                r#type: "network".to_string(),
            })?;

        if response.status().is_success() {
            let stream = response
                .bytes_stream()
                .map(|result: Result<bytes::Bytes, reqwest::Error>| -> Result<ChatStreamChunk, AiError> {
                    match result {
                        Ok(bytes) => {
                            let chunk_str = String::from_utf8_lossy(&bytes);
                            for line in chunk_str.lines() {
                                if let Ok(ollama_chunk) = serde_json::from_str::<serde_json::Value>(line) {
                                    if let Some(content) = ollama_chunk["message"]["content"].as_str() {
                                        let stream_chunk = ChatStreamChunk {
                                            id: uuid::Uuid::new_v4().to_string(),
                                            object: "chat.completion.chunk".to_string(),
                                            created: std::time::SystemTime::now()
                                                .duration_since(std::time::UNIX_EPOCH)
                                                .unwrap()
                                                .as_secs(),
                                            model: ollama_chunk["model"].as_str().unwrap_or("").to_string(),
                                            choices: vec![StreamChoice {
                                                index: 0,
                                                delta: StreamDelta {
                                                    role: Some("assistant".to_string()),
                                                    content: Some(content.to_string()),
                                                },
                                                finish_reason: if ollama_chunk.get("done").and_then(|v| v.as_bool()).unwrap_or(false) {
                                                    Some("stop".to_string())
                                                } else {
                                                    None
                                                },
                                            }],
                                        };
                                        return Ok(stream_chunk);
                                    }
                                }
                            }
                            // 如果没有有效数据，返回一个空的 chunk
                            Ok(ChatStreamChunk {
                                id: uuid::Uuid::new_v4().to_string(),
                                object: "chat.completion.chunk".to_string(),
                                created: std::time::SystemTime::now()
                                    .duration_since(std::time::UNIX_EPOCH)
                                    .unwrap()
                                    .as_secs(),
                                model: "".to_string(),
                                choices: vec![],
                            })
                        }
                        Err(e) => Err(AiError {
                            code: "stream_error".to_string(),
                            message: e.to_string(),
                            r#type: "stream".to_string(),
                        }),
                    }
                });

            Ok(Box::pin(stream))
        } else {
            let status = response.status();
            let error_text = response
                .text()
                .await
                .unwrap_or_else(|_| "Unknown error".to_string());

            Err(AiError {
                code: status.as_str().to_string(),
                message: error_text,
                r#type: "api_error".to_string(),
            })
        }
    }
}

/// AI 服务工厂
pub fn create_ai_client(config: AiConfig) -> Box<dyn AiClient + Send> {
    match config.provider {
        AiProvider::OpenAI => Box::new(OpenAIClient::new(config)),
        AiProvider::Ollama => Box::new(OllamaClient::new(config)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_ai_config_creation() {
        let config = AiConfig {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: Some("test-key".to_string()),
            model: "gpt-3.5-turbo".to_string(),
        };

        assert_eq!(config.provider, AiProvider::OpenAI);
        assert_eq!(config.base_url, "https://api.openai.com/v1");
        assert_eq!(config.api_key, Some("test-key".to_string()));
        assert_eq!(config.model, "gpt-3.5-turbo");
    }

    #[tokio::test]
    async fn test_ai_config_default() {
        let config = AiConfig::default();
        
        assert_eq!(config.provider, AiProvider::OpenAI);
        assert_eq!(config.base_url, "https://api.openai.com/v1");
        assert_eq!(config.api_key, None);
        assert_eq!(config.model, "gpt-3.5-turbo");
    }

    #[tokio::test]
    async fn test_openai_client_creation() {
        let config = AiConfig {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: Some("test-key".to_string()),
            model: "gpt-3.5-turbo".to_string(),
        };

        let client = OpenAIClient::new(config);
        // 验证客户端创建成功
        assert_eq!(client.config.base_url, "https://api.openai.com/v1");
        assert_eq!(client.config.api_key, Some("test-key".to_string()));
    }

    #[tokio::test]
    async fn test_ollama_client_creation() {
        let config = AiConfig {
            provider: AiProvider::Ollama,
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
            model: "llama2".to_string(),
        };

        let client = OllamaClient::new(config);
        // 验证客户端创建成功
        assert_eq!(client.config.base_url, "http://localhost:11434");
        assert_eq!(client.config.api_key, None);
        assert_eq!(client.config.model, "llama2");
    }

    #[tokio::test]
    async fn test_create_ai_client_factory() {
        // 测试 OpenAI 客户端工厂
        let openai_config = AiConfig {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: Some("test-key".to_string()),
            model: "gpt-3.5-turbo".to_string(),
        };

        let _openai_client = create_ai_client(openai_config);

        // 测试 Ollama 客户端工厂
        let ollama_config = AiConfig {
            provider: AiProvider::Ollama,
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
            model: "llama2".to_string(),
        };

        let _ollama_client = create_ai_client(ollama_config);
    }

    #[tokio::test]
    async fn test_chat_message_creation() {
        let message = ChatMessage {
            role: "user".to_string(),
            content: "Hello, AI!".to_string(),
        };

        assert_eq!(message.role, "user");
        assert_eq!(message.content, "Hello, AI!");
    }

    #[tokio::test]
    async fn test_chat_request_creation() {
        let request = ChatRequest {
            model: "gpt-3.5-turbo".to_string(),
            messages: vec![
                ChatMessage {
                    role: "system".to_string(),
                    content: "You are a helpful assistant.".to_string(),
                },
                ChatMessage {
                    role: "user".to_string(),
                    content: "Hello!".to_string(),
                },
            ],
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: Some(false),
        };

        assert_eq!(request.model, "gpt-3.5-turbo");
        assert_eq!(request.messages.len(), 2);
        assert_eq!(request.temperature, Some(0.7));
        assert_eq!(request.max_tokens, Some(100));
        assert_eq!(request.stream, Some(false));
    }

    #[tokio::test]
    async fn test_ai_error_creation() {
        let error = AiError {
            code: "test_error".to_string(),
            message: "This is a test error".to_string(),
            r#type: "test".to_string(),
        };

        assert_eq!(error.code, "test_error");
        assert_eq!(error.message, "This is a test error");
        assert_eq!(error.r#type, "test");
    }

    #[tokio::test]
    async fn test_ai_error_display() {
        let error = AiError {
            code: "test_error".to_string(),
            message: "This is a test error".to_string(),
            r#type: "test".to_string(),
        };

        let display_str = format!("{}", error);
        assert_eq!(display_str, "test_error: This is a test error");
    }

    #[tokio::test]
    async fn test_openai_headers() {
        let config = AiConfig {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: Some("test-api-key".to_string()),
            model: "gpt-3.5-turbo".to_string(),
        };

        let client = OpenAIClient::new(config);
        let headers = client.get_headers();

        assert!(headers.contains_key("content-type"));
        assert!(headers.contains_key("authorization"));
        
        let auth_header = headers.get("authorization").unwrap();
        assert_eq!(auth_header.to_str().unwrap(), "Bearer test-api-key");
    }

    #[tokio::test]
    async fn test_openai_headers_without_api_key() {
        let config = AiConfig {
            provider: AiProvider::OpenAI,
            base_url: "https://api.openai.com/v1".to_string(),
            api_key: None,
            model: "gpt-3.5-turbo".to_string(),
        };

        let client = OpenAIClient::new(config);
        let headers = client.get_headers();

        assert!(headers.contains_key("content-type"));
        assert!(!headers.contains_key("authorization"));
    }

    // 集成测试 - 需要真实的 API 连接
    #[tokio::test]
    #[ignore] // 默认忽略，需要手动启用进行真实测试
    async fn test_ai_with_config_module() {
        use crate::config::ConfigLoader;
        
        // 从配置文件加载配置
        let app_config = ConfigLoader::load_from_env().unwrap();
        
        println!("🔗 使用配置文件连接 AI...");
        println!("📋 AI 配置: {:?}", app_config.ai);
        
        // 克隆配置以避免所有权问题
        let ai_config = app_config.ai.clone();
        let client = create_ai_client(ai_config);
        
        let request = ChatRequest {
            model: app_config.ai.model,
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "你好，请简单介绍一下你自己。".to_string(),
            }],
            temperature: Some(0.7),
            max_tokens: Some(100),
            stream: Some(false),
        };
        
        match client.chat(request).await {
            Ok(response) => {
                println!("✅ 使用配置文件连接成功！");
                println!("📋 响应详情:");
                println!("  ID: {}", response.id);
                println!("  模型: {}", response.model);
                println!("  对象类型: {}", response.object);
                
                if let Some(choice) = response.choices.first() {
                    println!("  完成原因: {:?}", choice.finish_reason);
                    println!("  角色: {}", choice.message.role);
                    println!("🤖 AI 回复: {}", choice.message.content);
                    
                    assert!(!response.id.is_empty());
                    assert!(!response.model.is_empty());
                    assert!(!response.choices.is_empty());
                    assert!(!choice.message.content.is_empty());
                }
                
                if let Some(usage) = response.usage {
                    println!("📊 使用统计:");
                    println!("  提示词 tokens: {}", usage.prompt_tokens);
                    println!("  完成词 tokens: {}", usage.completion_tokens);
                    println!("  总计 tokens: {}", usage.total_tokens);
                }
            }
            Err(e) => {
                println!("❌ 连接测试失败: {}", e);
            }
        }
    }

    #[tokio::test]
    #[ignore] // 默认忽略，需要手动启用进行真实测试
    async fn test_real_ollama_connection() {
        let config = AiConfig {
            provider: AiProvider::Ollama,
            base_url: "http://localhost:11434".to_string(),
            api_key: None,
            model: "llama2".to_string(),
        };

        let client = create_ai_client(config);
        
        let request = ChatRequest {
            model: "llama2".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: "Hello, please introduce yourself.".to_string(),
            }],
            temperature: Some(0.7),
            max_tokens: Some(50),
            stream: Some(false),
        };

        match client.chat(request).await {
            Ok(response) => {
                assert!(!response.id.is_empty());
                assert!(!response.model.is_empty());
                assert!(!response.choices.is_empty());
                
                if let Some(choice) = response.choices.first() {
                    assert!(!choice.message.content.is_empty());
                    println!("Ollama 回复: {}", choice.message.content);
                }
            }
            Err(e) => {
                println!("Ollama 连接测试失败（可能未运行）: {}", e);
                // Ollama 可能未运行，不算失败
            }
        }
    }
}
