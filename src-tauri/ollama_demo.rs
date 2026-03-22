// Ollama 配置演示
use gopilot::{AiConfig, AiProvider, create_ai_client, ChatRequest, ChatMessage};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("🦙 GoPilot Ollama 支持演示");
    println!("================================");
    
    // Ollama 配置示例
    let ollama_config = AiConfig {
        provider: AiProvider::Ollama,
        base_url: "http://localhost:11434".to_string(),
        api_key: None,  // Ollama 不需要 API Key
        model: "llama2".to_string(),
    };
    
    println!("📋 Ollama 配置:");
    println!("  提供商: {:?}", ollama_config.provider);
    println!("  Base URL: {}", ollama_config.base_url);
    println!("  模型: {}", ollama_config.model);
    println!("  API Key: {:?}", ollama_config.api_key);
    
    // 创建 Ollama 客户端
    println!("\n🔧 创建 Ollama 客户端...");
    let client = create_ai_client(ollama_config);
    println!("✅ Ollama 客户端创建成功");
    
    // 准备聊天请求
    let request = ChatRequest {
        model: "llama2".to_string(),
        messages: vec![
            ChatMessage {
                role: "user".to_string(),
                content: "你好，请简单介绍一下你自己。".to_string(),
            }
        ],
        temperature: Some(0.7),
        max_tokens: Some(100),
        stream: Some(false),
    };
    
    println!("\n💬 发送聊天请求到 Ollama...");
    
    // 发送请求
    match client.chat(request).await {
        Ok(response) => {
            println!("✅ Ollama 响应成功！");
            println!("📋 响应详情:");
            println!("  ID: {}", response.id);
            println!("  模型: {}", response.model);
            println!("  对象类型: {}", response.object);
            
            if let Some(choice) = response.choices.first() {
                println!("  完成原因: {:?}", choice.finish_reason);
                println!("  角色: {}", choice.message.role);
                println!("🤖 Ollama 回复: {}", choice.message.content);
            }
            
            if let Some(usage) = response.usage {
                println!("📊 使用统计:");
                println!("  提示词 tokens: {}", usage.prompt_tokens);
                println!("  完成词 tokens: {}", usage.completion_tokens);
                println!("  总计 tokens: {}", usage.total_tokens);
            }
        }
        Err(e) => {
            println!("❌ Ollama 连接失败: {}", e);
            println!("\n💡 请确保:");
            println!("  1. Ollama 服务已安装并运行");
            println!("  2. Ollama 服务在 http://localhost:11434");
            println!("  3. 已下载 llama2 模型: ollama pull llama2");
        }
    }
    
    println!("\n🔧 .env 配置示例:");
    println!("AI_PROVIDER=Ollama");
    println!("AI_BASE_URL=http://localhost:11434");
    println!("AI_API_KEY=");
    println!("AI_MODEL=llama2");
    
    Ok(())
}
