use super::types::*;
use crate::ai::{create_ai_client, ChatRequest, ChatMessage};
use crate::config::ConfigLoader;
use serde_json;

pub struct TaskDecomposer {
    ai_client: Box<dyn crate::ai::AiClient>,
}

impl TaskDecomposer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config = ConfigLoader::load_from_env()?;
        let ai_client = create_ai_client(config.ai);
        Ok(Self { ai_client })
    }
    
    pub async fn decompose(&self, requirement: &UserRequirement) -> Result<Vec<DevelopmentTask>, Box<dyn std::error::Error>> {
        // 1. 生成拆解策略
        let strategy = self.generate_decomposition_strategy(requirement).await?;
        
        // 2. 执行任务拆解
        let tasks = self.execute_decomposition(requirement, &strategy).await?;
        
        // 3. 优化任务依赖关系
        let optimized_tasks = self.optimize_dependencies(tasks).await?;
        
        Ok(optimized_tasks)
    }
    
    async fn generate_decomposition_strategy(&self, requirement: &UserRequirement) -> Result<String, Box<dyn std::error::Error>> {
        let prompt = format!(
            "作为一个资深软件架构师，请将以下需求拆解为具体的开发任务：

需求：{}
领域：{:?}
复杂度：{:?}
项目类型：{}
技术栈：{}

请提供详细的拆解策略，包括：
1. 主要开发阶段（如：设计、实现、测试、部署）
2. 每个阶段的关键任务
3. 任务之间的依赖关系
4. 预估时间分配

请以结构化的方式返回，每个任务用【】标记：",
            requirement.raw_text,
            requirement.domain,
            requirement.complexity,
            requirement.context.project_type,
            requirement.context.tech_stack.join(", ")
        );
        
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: Some(0.3),
            max_tokens: Some(2000),
            stream: Some(false),
        }).await?;
        
        Ok(response.choices[0].message.content.clone())
    }
    
    async fn execute_decomposition(&self, requirement: &UserRequirement, strategy: &str) -> Result<Vec<DevelopmentTask>, Box<dyn std::error::Error>> {
        let mut tasks = Vec::new();
        
        // 解析策略中的任务
        let task_descriptions = self.parse_strategy_tasks(strategy)?;
        
        for (index, description) in task_descriptions.iter().enumerate() {
            let task = self.create_task_from_description(requirement, description, index).await?;
            tasks.push(task);
        }
        
        Ok(tasks)
    }
    
    async fn create_task_from_description(&self, requirement: &UserRequirement, description: &str, index: usize) -> Result<DevelopmentTask, Box<dyn std::error::Error>> {
        let prompt = format!(
            "基于以下需求描述，创建一个具体的开发任务：

原始需求：{}
任务描述：{}

请提供任务的详细信息，以JSON格式返回：
{{
  \"title\": \"任务标题\",
  \"description\": \"详细描述\",
  \"task_type\": \"Research|Design|Implementation|Testing|Documentation|Integration|Deployment\",
  \"priority\": \"Critical|High|Medium|Low\",
  \"estimated_time\": 估算时间（分钟）,
  \"dependencies\": [\"依赖的任务ID列表\"],
  \"required_files\": [\"需要创建或修改的文件列表\"],
  \"acceptance_criteria\": [\"验收标准列表\"]
}}",
            requirement.raw_text,
            description
        );
        
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: Some(0.2),
            max_tokens: Some(1000),
            stream: Some(false),
        }).await?;
        
        // 尝试解析 JSON，如果失败则创建默认任务
        let task: Result<DevelopmentTask, _> = serde_json::from_str(&response.choices[0].message.content);
        
        match task {
            Ok(mut task) => {
                task.id = format!("task-{}-{}", requirement.id, index);
                Ok(task)
            }
            Err(_) => {
                // 如果 AI 返回的不是有效 JSON，创建一个默认任务
                Ok(DevelopmentTask {
                    id: format!("task-{}-{}", requirement.id, index),
                    title: description.to_string(),
                    description: format!("基于需求：{}", requirement.raw_text),
                    task_type: TaskType::Implementation,
                    priority: Priority::Medium,
                    estimated_time: 120, // 默认2小时
                    dependencies: Vec::new(),
                    required_files: vec![format!("{}.rs", description.replace(" ", "_"))],
                    acceptance_criteria: vec!["功能正常工作".to_string()],
                })
            }
        }
    }
    
    fn parse_strategy_tasks(&self, strategy: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let mut tasks = Vec::new();
        
        // 简单的任务解析逻辑
        for line in strategy.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('【') && trimmed.ends_with('】') {
                let task = trimmed.trim_start_matches('【').trim_end_matches('】').to_string();
                if !task.is_empty() {
                    tasks.push(task);
                }
            }
        }
        
        // 如果没有找到格式化的任务，尝试按行拆分
        if tasks.is_empty() {
            for line in strategy.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && !trimmed.starts_with('#') && !trimmed.starts_with('-') {
                    tasks.push(trimmed.to_string());
                }
            }
        }
        
        Ok(tasks)
    }
    
    async fn optimize_dependencies(&self, tasks: Vec<DevelopmentTask>) -> Result<Vec<DevelopmentTask>, Box<dyn std::error::Error>> {
        // 简单的依赖优化逻辑
        // 实际实现中可以使用更复杂的算法
        let mut optimized_tasks = tasks;
        
        // 按优先级排序
        optimized_tasks.sort_by(|a, b| {
            match (&a.priority, &b.priority) {
                (Priority::Critical, Priority::Critical) => std::cmp::Ordering::Equal,
                (Priority::Critical, _) => std::cmp::Ordering::Less,
                (_, Priority::Critical) => std::cmp::Ordering::Greater,
                (Priority::High, Priority::High) => std::cmp::Ordering::Equal,
                (Priority::High, _) => std::cmp::Ordering::Less,
                (_, Priority::High) => std::cmp::Ordering::Greater,
                (Priority::Medium, Priority::Medium) => std::cmp::Ordering::Equal,
                (Priority::Medium, _) => std::cmp::Ordering::Less,
                (_, Priority::Medium) => std::cmp::Ordering::Greater,
                (Priority::Low, Priority::Low) => std::cmp::Ordering::Equal,
            }
        });
        
        Ok(optimized_tasks)
    }
    
    // 简单的任务拆解（不使用 AI）
    pub fn simple_decompose(&self, requirement: &UserRequirement) -> Vec<DevelopmentTask> {
        let mut tasks = Vec::new();
        
        // 基于需求类型创建基础任务
        match requirement.intent {
            RequirementIntent::CreateFeature => {
                tasks.push(DevelopmentTask {
                    id: format!("{}-design", requirement.id),
                    title: "设计功能架构".to_string(),
                    description: format!("设计 {} 的架构和实现方案", requirement.raw_text),
                    task_type: TaskType::Design,
                    priority: Priority::High,
                    estimated_time: 60,
                    dependencies: Vec::new(),
                    required_files: vec!["design.md".to_string()],
                    acceptance_criteria: vec!["架构设计完成".to_string(), "技术方案确定".to_string()],
                });
                
                tasks.push(DevelopmentTask {
                    id: format!("{}-implement", requirement.id),
                    title: "实现核心功能".to_string(),
                    description: format!("实现 {}", requirement.raw_text),
                    task_type: TaskType::Implementation,
                    priority: Priority::High,
                    estimated_time: 240,
                    dependencies: vec![format!("{}-design", requirement.id)],
                    required_files: vec!["main.rs".to_string()],
                    acceptance_criteria: vec!["功能正常工作".to_string(), "测试通过".to_string()],
                });
                
                tasks.push(DevelopmentTask {
                    id: format!("{}-test", requirement.id),
                    title: "编写测试用例".to_string(),
                    description: format!("为 {} 编写测试", requirement.raw_text),
                    task_type: TaskType::Testing,
                    priority: Priority::Medium,
                    estimated_time: 120,
                    dependencies: vec![format!("{}-implement", requirement.id)],
                    required_files: vec!["test.rs".to_string()],
                    acceptance_criteria: vec!["测试覆盖率 > 80%".to_string(), "所有测试通过".to_string()],
                });
            }
            RequirementIntent::FixBug => {
                tasks.push(DevelopmentTask {
                    id: format!("{}-debug", requirement.id),
                    title: "问题诊断".to_string(),
                    description: format!("诊断 {} 的问题原因", requirement.raw_text),
                    task_type: TaskType::Research,
                    priority: Priority::Critical,
                    estimated_time: 60,
                    dependencies: Vec::new(),
                    required_files: vec!["debug.log".to_string()],
                    acceptance_criteria: vec!["问题原因确定".to_string()],
                });
                
                tasks.push(DevelopmentTask {
                    id: format!("{}-fix", requirement.id),
                    title: "修复问题".to_string(),
                    description: format!("修复 {}", requirement.raw_text),
                    task_type: TaskType::Implementation,
                    priority: Priority::Critical,
                    estimated_time: 120,
                    dependencies: vec![format!("{}-debug", requirement.id)],
                    required_files: vec!["fix.rs".to_string()],
                    acceptance_criteria: vec!["问题已修复".to_string(), "回归测试通过".to_string()],
                });
            }
            _ => {
                // 其他类型的默认处理
                tasks.push(DevelopmentTask {
                    id: format!("{}-default", requirement.id),
                    title: "执行任务".to_string(),
                    description: requirement.raw_text.clone(),
                    task_type: TaskType::Implementation,
                    priority: Priority::Medium,
                    estimated_time: 180,
                    dependencies: Vec::new(),
                    required_files: vec!["implementation.rs".to_string()],
                    acceptance_criteria: vec!["任务完成".to_string()],
                });
            }
        }
        
        tasks
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    
    fn create_test_requirement() -> UserRequirement {
        UserRequirement {
            id: "test-1".to_string(),
            raw_text: "创建一个简单的用户注册功能".to_string(),
            intent: RequirementIntent::CreateFeature,
            complexity: ComplexityLevel::Simple,
            domain: DomainType::Backend,
            context: ProjectContext {
                project_root: PathBuf::from("/test"),
                project_type: "web".to_string(),
                tech_stack: vec!["rust".to_string(), "postgres".to_string()],
                existing_files: Vec::new(),
                dependencies: Vec::new(),
            },
            created_at: chrono::Utc::now(),
        }
    }
    
    #[test]
    fn test_simple_decompose() {
        let decomposer = TaskDecomposer::new().unwrap();
        let requirement = create_test_requirement();
        
        let tasks = decomposer.simple_decompose(&requirement);
        
        assert!(!tasks.is_empty());
        assert!(tasks.iter().any(|t| t.title.contains("设计")));
        assert!(tasks.iter().any(|t| t.title.contains("实现")));
    }
    
    #[test]
    fn test_parse_strategy_tasks() {
        let decomposer = TaskDecomposer::new().unwrap();
        
        let strategy = "【设计数据库模型】\n【实现API接口】\n【编写测试】";
        let tasks = decomposer.parse_strategy_tasks(strategy).unwrap();
        
        assert_eq!(tasks.len(), 3);
        assert!(tasks.contains(&"设计数据库模型".to_string()));
        assert!(tasks.contains(&"实现API接口".to_string()));
        assert!(tasks.contains(&"编写测试".to_string()));
    }
    
    #[tokio::test]
    async fn test_task_decomposition() {
        // 这个测试需要有效的 AI 配置才能运行
        // let decomposer = TaskDecomposer::new().unwrap();
        // let requirement = create_test_requirement();
        // let tasks = decomposer.decompose(&requirement).await.unwrap();
        // assert!(!tasks.is_empty());
    }
}
