// GoPilot AI 模块库
pub mod ai;
pub mod config;
pub mod task_decomposition;

// 重新导出 AI 相关的公共接口
pub use ai::{
    AiConfig, AiProvider, ChatRequest, ChatMessage, ChatResponse, ChatStreamChunk,
    AiError, AiClient, OpenAIClient, OllamaClient, create_ai_client
};

// 重新导出配置相关接口
pub use config::{
    AppConfig, DatabaseConfig, AppSettings, ConfigLoader, ConfigError
};

// 重新导出任务拆解相关接口
pub use task_decomposition::{
    UserRequirement, RequirementIntent, ComplexityLevel, DomainType, ProjectContext,
    DevelopmentTask, TaskType, Priority, RequirementAnalyzer, TaskDecomposer, IntentClassifier
};
