// 配置文件读取模块
use std::env;
use std::fs;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::ai::{AiConfig, AiProvider};

/// 应用配置结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// AI 配置
    pub ai: AiConfig,
    /// 数据库配置
    pub database: DatabaseConfig,
    /// 应用设置
    pub app: AppSettings,
}

/// 数据库配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    /// 默认数据库类型
    pub default_type: String,
    /// 连接超时（秒）
    pub connection_timeout: u64,
    /// 查询超时（秒）
    pub query_timeout: u64,
}

/// 应用设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    /// 应用名称
    pub name: String,
    /// 版本
    pub version: String,
    /// 调试模式
    pub debug: bool,
    /// 日志级别
    pub log_level: String,
}

/// 配置加载器
pub struct ConfigLoader;

impl ConfigLoader {
    /// 从 .env 文件加载配置
    pub fn load_from_env() -> Result<AppConfig, ConfigError> {
        // 尝试加载 .env 文件
        Self::load_env_file()?;
        
        // 读取 AI 配置
        let ai_config = Self::load_ai_config()?;
        
        // 读取数据库配置
        let db_config = Self::load_database_config()?;
        
        // 读取应用设置
        let app_settings = Self::load_app_settings()?;
        
        Ok(AppConfig {
            ai: ai_config,
            database: db_config,
            app: app_settings,
        })
    }
    
    /// 加载 .env 文件
    fn load_env_file() -> Result<(), ConfigError> {
        let env_paths = [
            ".env",
            ".env.local",
            ".env.development",
            ".env.production",
        ];
        
        let mut env_loaded = false;
        
        for env_path in &env_paths {
            if Path::new(env_path).exists() {
                match dotenvy::from_filename(env_path) {
                    Ok(_) => {
                        println!("✅ 成功加载配置文件: {}", env_path);
                        env_loaded = true;
                        break;
                    }
                    Err(e) => {
                        eprintln!("⚠️ 加载配置文件 {} 失败: {}", env_path, e);
                    }
                }
            }
        }
        
        if !env_loaded {
            println!("📝 未找到 .env 文件，将使用环境变量或默认值");
        }
        
        Ok(())
    }
    
    /// 加载 AI 配置
    fn load_ai_config() -> Result<AiConfig, ConfigError> {
        let provider = env::var("AI_PROVIDER")
            .unwrap_or_else(|_| "OpenAI".to_string());
        
        let provider = match provider.to_lowercase().as_str() {
            "openai" => AiProvider::OpenAI,
            "ollama" => AiProvider::Ollama,
            _ => AiProvider::OpenAI, // 默认值
        };
        
        let base_url = env::var("AI_BASE_URL")
            .unwrap_or_else(|_| {
                match provider {
                    AiProvider::OpenAI => "https://api.openai.com/v1".to_string(),
                    AiProvider::Ollama => "http://localhost:11434".to_string(),
                }
            });
        
        let api_key = env::var("AI_API_KEY").ok();
        
        let model = env::var("AI_MODEL")
            .unwrap_or_else(|_| {
                match provider {
                    AiProvider::OpenAI => "gpt-3.5-turbo".to_string(),
                    AiProvider::Ollama => "llama2".to_string(),
                }
            });
        
        Ok(AiConfig {
            provider,
            base_url,
            api_key,
            model,
        })
    }
    
    /// 加载数据库配置
    fn load_database_config() -> Result<DatabaseConfig, ConfigError> {
        let default_type = env::var("DB_DEFAULT_TYPE")
            .unwrap_or_else(|_| "sqlite".to_string());
        
        let connection_timeout = env::var("DB_CONNECTION_TIMEOUT")
            .unwrap_or_else(|_| "30".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidFormat("DB_CONNECTION_TIMEOUT".to_string()))?;
        
        let query_timeout = env::var("DB_QUERY_TIMEOUT")
            .unwrap_or_else(|_| "60".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidFormat("DB_QUERY_TIMEOUT".to_string()))?;
        
        Ok(DatabaseConfig {
            default_type,
            connection_timeout,
            query_timeout,
        })
    }
    
    /// 加载应用设置
    fn load_app_settings() -> Result<AppSettings, ConfigError> {
        let name = env::var("APP_NAME")
            .unwrap_or_else(|_| "GoPilot".to_string());
        
        let version = env::var("APP_VERSION")
            .unwrap_or_else(|_| "1.0.0".to_string());
        
        let debug = env::var("APP_DEBUG")
            .unwrap_or_else(|_| "false".to_string())
            .parse()
            .map_err(|_| ConfigError::InvalidFormat("APP_DEBUG".to_string()))?;
        
        let log_level = env::var("APP_LOG_LEVEL")
            .unwrap_or_else(|_| "info".to_string());
        
        Ok(AppSettings {
            name,
            version,
            debug,
            log_level,
        })
    }
    
    /// 创建示例 .env 文件
    pub fn create_example_env() -> Result<(), ConfigError> {
        let example_content = r#"# GoPilot 配置文件示例
# 复制此文件为 .env 并修改相应配置

# AI 配置
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=your-api-key-here
AI_MODEL=qwen-turbo

# 数据库配置
DB_DEFAULT_TYPE=sqlite
DB_CONNECTION_TIMEOUT=30
DB_QUERY_TIMEOUT=60

# 应用设置
APP_NAME=GoPilot
APP_VERSION=1.0.0
APP_DEBUG=true
APP_LOG_LEVEL=info
"#;
        
        fs::write(".env.example", example_content)
            .map_err(|e| ConfigError::IoError(e.to_string()))?;
        
        println!("✅ 已创建示例配置文件: .env.example");
        Ok(())
    }
    
    /// 验证配置
    pub fn validate_config(config: &AppConfig) -> Result<(), ConfigError> {
        // 验证 AI 配置
        if config.ai.base_url.is_empty() {
            return Err(ConfigError::MissingField("AI_BASE_URL".to_string()));
        }
        
        if config.ai.model.is_empty() {
            return Err(ConfigError::MissingField("AI_MODEL".to_string()));
        }
        
        // 对于 OpenAI，检查 API Key
        if matches!(config.ai.provider, AiProvider::OpenAI) && config.ai.api_key.is_none() {
            return Err(ConfigError::MissingField("AI_API_KEY".to_string()));
        }
        
        // 验证数据库配置
        if config.database.connection_timeout == 0 {
            return Err(ConfigError::InvalidValue("DB_CONNECTION_TIMEOUT".to_string()));
        }
        
        if config.database.query_timeout == 0 {
            return Err(ConfigError::InvalidValue("DB_QUERY_TIMEOUT".to_string()));
        }
        
        println!("✅ 配置验证通过");
        Ok(())
    }
}

/// 配置错误类型
#[derive(Debug, Clone)]
pub enum ConfigError {
    /// 环境变量未找到
    EnvVarNotFound(String),
    /// 字段缺失
    MissingField(String),
    /// 格式错误
    InvalidFormat(String),
    /// 值无效
    InvalidValue(String),
    /// IO 错误
    IoError(String),
    /// 其他错误
    Other(String),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::EnvVarNotFound(field) => write!(f, "环境变量未找到: {}", field),
            ConfigError::MissingField(field) => write!(f, "配置字段缺失: {}", field),
            ConfigError::InvalidFormat(field) => write!(f, "配置格式错误: {}", field),
            ConfigError::InvalidValue(field) => write!(f, "配置值无效: {}", field),
            ConfigError::IoError(msg) => write!(f, "IO 错误: {}", msg),
            ConfigError::Other(msg) => write!(f, "配置错误: {}", msg),
        }
    }
}

impl std::error::Error for ConfigError {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    
    #[tokio::test]
    async fn test_config_loading() {
        // 设置测试环境变量
        env::set_var("AI_PROVIDER", "OpenAI");
        env::set_var("AI_BASE_URL", "https://test.api.com");
        env::set_var("AI_API_KEY", "test-key");
        env::set_var("AI_MODEL", "test-model");
        env::set_var("DB_DEFAULT_TYPE", "sqlite");
        env::set_var("APP_NAME", "TestApp");
        
        let config = ConfigLoader::load_from_env().unwrap();
        
        assert_eq!(config.ai.provider, AiProvider::OpenAI);
        assert_eq!(config.ai.base_url, "https://test.api.com");
        assert_eq!(config.ai.api_key, Some("test-key".to_string()));
        assert_eq!(config.ai.model, "test-model");
        assert_eq!(config.database.default_type, "sqlite");
        assert_eq!(config.app.name, "TestApp");
        
        // 清理测试环境变量
        env::remove_var("AI_PROVIDER");
        env::remove_var("AI_BASE_URL");
        env::remove_var("AI_API_KEY");
        env::remove_var("AI_MODEL");
        env::remove_var("DB_DEFAULT_TYPE");
        env::remove_var("APP_NAME");
        
        println!("✅ 配置加载测试通过");
    }
    
    #[tokio::test]
    async fn test_default_config() {
        // 清理所有相关环境变量
        std::env::remove_var("AI_PROVIDER");
        std::env::remove_var("AI_BASE_URL");
        std::env::remove_var("AI_API_KEY");
        std::env::remove_var("AI_MODEL");
        
        let config = ConfigLoader::load_from_env().unwrap();
        
        // 验证默认值
        assert_eq!(config.ai.provider, AiProvider::OpenAI);
        assert_eq!(config.ai.base_url, "https://api.openai.com/v1");
        assert_eq!(config.ai.api_key, None);
        assert_eq!(config.ai.model, "gpt-3.5-turbo");
        
        println!("✅ 默认配置测试通过");
    }
    
    #[tokio::test]
    #[ignore] // 默认忽略，需要手动启用进行真实测试
    async fn test_real_config_loading() {
        // 创建示例 .env 文件
        ConfigLoader::create_example_env().unwrap();
        
        // 加载配置
        let config = ConfigLoader::load_from_env().unwrap();
        
        println!("📋 加载的配置:");
        println!("  AI 提供商: {:?}", config.ai.provider);
        println!("  AI Base URL: {}", config.ai.base_url);
        println!("  AI 模型: {}", config.ai.model);
        println!("  数据库类型: {}", config.database.default_type);
        println!("  应用名称: {}", config.app.name);
        println!("  调试模式: {}", config.app.debug);
        
        // 验证配置
        ConfigLoader::validate_config(&config).unwrap();
        
        println!("✅ 配置加载和验证成功");
    }
}
