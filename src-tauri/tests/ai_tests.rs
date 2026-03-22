// AI 模块独立测试
use gopilot::ai::{AiConfig, AiProvider, ChatRequest, ChatMessage, create_ai_client, AiError};

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

// 集成测试 - 需要真实的 API 连接
#[tokio::test]
#[ignore] // 默认忽略，需要手动启用进行真实测试
async fn test_real_openai_connection() {
    let config = AiConfig {
        provider: AiProvider::OpenAI,
        base_url: "https://dashscope.aliyuncs.com/compatible-mode".to_string(),
        api_key: Some("sk-1b7618ac4d9343f3b5aefcd74f4cf428".to_string()),
        model: "qwen-turbo".to_string(),
    };

    let client = create_ai_client(config);
    
    let request = ChatRequest {
        model: "qwen-turbo".to_string(),
        messages: vec![ChatMessage {
            role: "user".to_string(),
            content: "你好，请简单介绍一下你自己。".to_string(),
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
                println!("✅ AI 回复: {}", choice.message.content);
            }
        }
        Err(e) => {
            panic!("❌ 连接测试失败: {}", e);
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
                println!("✅ Ollama 回复: {}", choice.message.content);
            }
        }
        Err(e) => {
            println!("⚠️ Ollama 连接测试失败（可能未运行）: {}", e);
            // Ollama 可能未运行，不算失败
        }
    }
}
