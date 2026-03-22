use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRequirement {
    pub id: String,
    pub raw_text: String,
    pub intent: RequirementIntent,
    pub complexity: ComplexityLevel,
    pub domain: DomainType,
    pub context: ProjectContext,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequirementIntent {
    CreateFeature,
    FixBug,
    RefactorCode,
    AddTests,
    Documentation,
    Optimization,
    Integration,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ComplexityLevel {
    Simple,    // 1-2 小时
    Medium,    // 1-2 天
    Complex,   // 3-7 天
    Expert,    // 需要专家级实现
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DomainType {
    Frontend,
    Backend,
    Database,
    DevOps,
    Mobile,
    AI,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectContext {
    pub project_root: PathBuf,
    pub project_type: String,
    pub tech_stack: Vec<String>,
    pub existing_files: Vec<String>,
    pub dependencies: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevelopmentTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub task_type: TaskType,
    pub priority: Priority,
    pub estimated_time: u32, // 分钟
    pub dependencies: Vec<String>,
    pub required_files: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    Research,
    Design,
    Implementation,
    Testing,
    Documentation,
    Integration,
    Deployment,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Priority {
    Critical,
    High,
    Medium,
    Low,
}

// 错误类型
#[derive(Debug, Clone)]
pub enum AnalysisError {
    ClassificationError(String),
    EstimationError(String),
    ContextError(String),
}

impl std::fmt::Display for AnalysisError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AnalysisError::ClassificationError(msg) => write!(f, "分类错误: {}", msg),
            AnalysisError::EstimationError(msg) => write!(f, "估算错误: {}", msg),
            AnalysisError::ContextError(msg) => write!(f, "上下文错误: {}", msg),
        }
    }
}

impl std::error::Error for AnalysisError {}

#[derive(Debug, Clone)]
pub enum DecompositionError {
    AIServiceError(String),
    ParseError(String),
    TaskCreationError(String),
}

impl std::fmt::Display for DecompositionError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DecompositionError::AIServiceError(msg) => write!(f, "AI 服务错误: {}", msg),
            DecompositionError::ParseError(msg) => write!(f, "解析错误: {}", msg),
            DecompositionError::TaskCreationError(msg) => write!(f, "任务创建错误: {}", msg),
        }
    }
}

impl std::error::Error for DecompositionError {}
