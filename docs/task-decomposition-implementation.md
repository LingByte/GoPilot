# 任务拆解与持续代码生成核心实现

## 🎯 核心问题

如何将复杂的用户需求拆解为可执行的开发任务，并持续生成高质量的代码？

## 🧠 任务拆解引擎

### 1. 需求分析器

```rust
// src-tauri/src/task_decomposition/analyzer.rs
use serde::{Deserialize, Serialize};
use regex::Regex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRequirement {
    pub raw_text: String,
    pub intent: RequirementIntent,
    pub complexity: ComplexityLevel,
    pub domain: DomainType,
    pub context: ProjectContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequirementIntent {
    CreateFeature,      // 创建新功能
    FixBug,            // 修复 bug
    RefactorCode,      // 重构代码
    AddTests,          // 添加测试
    Documentation,     // 编写文档
    Optimization,      // 性能优化
    Integration,       // 集成第三方服务
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
    Frontend,   // 前端开发
    Backend,    // 后端开发
    Database,   // 数据库
    DevOps,     // 运维部署
    Mobile,     // 移动端
    AI,         // AI/ML
}

pub struct RequirementAnalyzer {
    intent_classifier: IntentClassifier,
    complexity_estimator: ComplexityEstimator,
    domain_detector: DomainDetector,
}

impl RequirementAnalyzer {
    pub async fn analyze(&self, requirement: String, context: ProjectContext) -> Result<UserRequirement, AnalysisError> {
        // 1. 意图识别
        let intent = self.intent_classifier.classify(&requirement).await?;
        
        // 2. 复杂度评估
        let complexity = self.complexity_estimator.estimate(&requirement, &context).await?;
        
        // 3. 领域检测
        let domain = self.domain_detector.detect(&requirement, &context).await?;
        
        Ok(UserRequirement {
            raw_text: requirement,
            intent,
            complexity,
            domain,
            context,
        })
    }
}

// 意图分类器
pub struct IntentClassifier {
    patterns: Vec<(Regex, RequirementIntent)>,
}

impl IntentClassifier {
    pub fn new() -> Self {
        let patterns = vec![
            (Regex::new(r"(?i)创建|实现|开发|添加.*功能").unwrap(), RequirementIntent::CreateFeature),
            (Regex::new(r"(?i)修复|解决.*bug|错误").unwrap(), RequirementIntent::FixBug),
            (Regex::new(r"(?i)重构|优化.*代码").unwrap(), RequirementIntent::RefactorCode),
            (Regex::new(r"(?i)测试|单元测试|集成测试").unwrap(), RequirementIntent::AddTests),
            (Regex::new(r"(?i)文档|说明|readme").unwrap(), RequirementIntent::Documentation),
            (Regex::new(r"(?i)性能|优化|加速").unwrap(), RequirementIntent::Optimization),
            (Regex::new(r"(?i)集成|连接.*api").unwrap(), RequirementIntent::Integration),
        ];
        
        Self { patterns }
    }
    
    pub async fn classify(&self, text: &str) -> Result<RequirementIntent, ClassificationError> {
        for (pattern, intent) in &self.patterns {
            if pattern.is_match(text) {
                return Ok(intent.clone());
            }
        }
        
        // 默认为创建功能
        Ok(RequirementIntent::CreateFeature)
    }
}
```

### 2. 任务拆解器

```rust
// src-tauri/src/task_decomposition/decomposer.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DevelopmentTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub task_type: TaskType,
    pub priority: Priority,
    pub estimated_time: u32, // 分钟
    pub dependencies: Vec<String>,
    pub subtasks: Vec<DevelopmentTask>,
    pub required_files: Vec<String>,
    pub code_templates: Vec<CodeTemplate>,
    pub acceptance_criteria: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum TaskType {
    Research,           // 研究任务
    Design,            // 设计任务
    Implementation,    // 实现任务
    Testing,           // 测试任务
    Documentation,     // 文档任务
    Integration,       // 集成任务
    Deployment,        // 部署任务
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum Priority {
    Critical,
    High,
    Medium,
    Low,
}

pub struct TaskDecomposer {
    ai_client: Box<dyn AiClient>,
    template_library: TemplateLibrary,
    project_analyzer: ProjectAnalyzer,
}

impl TaskDecomposer {
    pub async fn decompose(&self, requirement: UserRequirement) -> Result<Vec<DevelopmentTask>, DecompositionError> {
        // 1. 分析项目结构
        let project_structure = self.project_analyzer.analyze(&requirement.context).await?;
        
        // 2. 生成拆解策略
        let strategy = self.generate_decomposition_strategy(&requirement, &project_structure).await?;
        
        // 3. 执行任务拆解
        let tasks = self.execute_decomposition(&requirement, &strategy).await?;
        
        // 4. 优化任务依赖关系
        let optimized_tasks = self.optimize_dependencies(tasks).await?;
        
        Ok(optimized_tasks)
    }
    
    async fn generate_decomposition_strategy(&self, requirement: &UserRequirement, structure: &ProjectStructure) -> Result<DecompositionStrategy, AIError> {
        let prompt = format!(
            "作为一个资深软件架构师，请将以下需求拆解为具体的开发任务：

需求：{}
领域：{:?}
复杂度：{:?}
项目结构：{}

请提供详细的拆解策略，包括：
1. 主要开发阶段
2. 每个阶段的关键任务
3. 任务之间的依赖关系
4. 预估时间分配",
            requirement.raw_text,
            requirement.domain,
            requirement.complexity,
            structure.summary()
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
        
        let strategy = DecompositionStrategy::from_ai_response(response.choices[0].message.content.clone())?;
        Ok(strategy)
    }
    
    async fn execute_decomposition(&self, requirement: &UserRequirement, strategy: &DecompositionStrategy) -> Result<Vec<DevelopmentTask>, AIError> {
        let mut tasks = Vec::new();
        
        for (phase_index, phase) in strategy.phases.iter().enumerate() {
            for (task_index, task_desc) in phase.tasks.iter().enumerate() {
                let task = self.create_task_from_description(
                    requirement,
                    task_desc,
                    phase_index,
                    task_index,
                ).await?;
                
                tasks.push(task);
            }
        }
        
        Ok(tasks)
    }
    
    async fn create_task_from_description(&self, requirement: &UserRequirement, description: &str, phase: usize, index: usize) -> Result<DevelopmentTask, AIError> {
        let prompt = format!(
            "基于以下需求描述，创建一个具体的开发任务：

原始需求：{}
任务描述：{}

请提供任务的详细信息：
1. 任务标题
2. 详细描述
3. 任务类型
4. 优先级
5. 预估时间（分钟）
6. 需要创建或修改的文件
7. 验收标准

请以JSON格式返回。",
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
        
        let task: DevelopmentTask = serde_json::from_str(&response.choices[0].message.content)?;
        Ok(task)
    }
}
```

## 🔄 持续代码生成引擎

### 1. 代码生成上下文管理

```rust
// src-tauri/src/code_generation/context.rs
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenerationContext {
    pub project_root: PathBuf,
    pub current_file: Option<PathBuf>,
    pub file_tree: FileTree,
    pub dependencies: ProjectDependencies,
    pub coding_standards: CodingStandards,
    pub existing_code: ExistingCodeContext,
    pub generation_history: Vec<GenerationRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTree {
    pub files: Vec<FileNode>,
    pub directories: Vec<DirectoryNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub path: PathBuf,
    pub language: String,
    pub size: u64,
    pub last_modified: SystemTime,
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExistingCodeContext {
    pub imports: Vec<String>,
    pub functions: Vec<FunctionSignature>,
    pub classes: Vec<ClassDefinition>,
    pub variables: Vec<VariableDefinition>,
    pub patterns: Vec<CodePattern>,
}

pub struct ContextManager {
    project_analyzer: ProjectAnalyzer,
    code_parser: CodeParser,
    context_cache: Arc<Mutex<LruCache<String, CodeGenerationContext>>>,
}

impl ContextManager {
    pub async fn build_context(&self, project_root: &Path, current_file: Option<&Path>) -> Result<CodeGenerationContext, ContextError> {
        let cache_key = format!("{}:{:?}", project_root.display(), current_file);
        
        // 检查缓存
        if let Some(cached) = self.context_cache.lock().await.get(&cache_key) {
            return Ok(cached.clone());
        }
        
        // 构建文件树
        let file_tree = self.project_analyzer.build_file_tree(project_root).await?;
        
        // 分析依赖关系
        let dependencies = self.project_analyzer.analyze_dependencies(project_root).await?;
        
        // 解析现有代码
        let existing_code = self.analyze_existing_code(&file_tree).await?;
        
        // 获取编码规范
        let coding_standards = self.detect_coding_standards(&file_tree).await?;
        
        let context = CodeGenerationContext {
            project_root: project_root.to_path_buf(),
            current_file: current_file.map(|p| p.to_path_buf()),
            file_tree,
            dependencies,
            coding_standards,
            existing_code,
            generation_history: Vec::new(),
        };
        
        // 缓存上下文
        self.context_cache.lock().await.put(cache_key, context.clone());
        
        Ok(context)
    }
    
    async fn analyze_existing_code(&self, file_tree: &FileTree) -> Result<ExistingCodeContext, ParseError> {
        let mut imports = Vec::new();
        let mut functions = Vec::new();
        let mut classes = Vec::new();
        let mut variables = Vec::new();
        let mut patterns = Vec::new();
        
        for file in &file_tree.files {
            if self.is_source_file(&file.path) {
                let content = tokio::fs::read_to_string(&file.path).await?;
                let parsed = self.code_parser.parse(&content, &file.language)?;
                
                imports.extend(parsed.imports);
                functions.extend(parsed.functions);
                classes.extend(parsed.classes);
                variables.extend(parsed.variables);
                patterns.extend(parsed.patterns);
            }
        }
        
        Ok(ExistingCodeContext {
            imports,
            functions,
            classes,
            variables,
            patterns,
        })
    }
}
```

### 2. 智能代码生成器

```rust
// src-tauri/src/code_generation/generator.rs
pub struct IntelligentCodeGenerator {
    ai_client: Box<dyn AiClient>,
    context_manager: ContextManager,
    template_engine: TemplateEngine,
    code_validator: CodeValidator,
    quality_scorer: CodeQualityScorer,
}

impl IntelligentCodeGenerator {
    pub async fn generate_code(&self, task: &DevelopmentTask, context: &CodeGenerationContext) -> Result<GeneratedCode, GenerationError> {
        // 1. 构建生成提示
        let prompt = self.build_generation_prompt(task, context).await?;
        
        // 2. 生成初始代码
        let initial_code = self.generate_initial_code(&prompt).await?;
        
        // 3. 代码优化
        let optimized_code = self.optimize_code(&initial_code, context).await?;
        
        // 4. 质量检查
        let quality_score = self.quality_scorer.score(&optimized_code, context).await?;
        
        // 5. 如果质量不达标，重新生成
        let final_code = if quality_score < 0.7 {
            self.regenerate_with_feedback(&optimized_code, &prompt, quality_score).await?
        } else {
            optimized_code
        };
        
        // 6. 验证代码
        self.code_validator.validate(&final_code, context).await?;
        
        Ok(GeneratedCode {
            code: final_code,
            quality_score,
            generation_time: SystemTime::now(),
            context_used: context.clone(),
            task_id: task.id.clone(),
        })
    }
    
    async fn build_generation_prompt(&self, task: &DevelopmentTask, context: &CodeGenerationContext) -> Result<String, PromptError> {
        let prompt = format!(
            r#"你是一个专业的软件开发工程师。请根据以下任务和上下文生成高质量的代码：

## 任务信息
标题：{}
描述：{}
类型：{:?}
优先级：{:?}

## 项目上下文
项目根目录：{}
当前文件：{:?}
编程语言：{}

## 现有代码结构
导入的模块：{}
已定义的函数：{}
已定义的类：{}
全局变量：{}

## 编码规范
命名风格：{:?}
缩进：{:?}
行长度限制：{}

## 要求
1. 代码必须符合项目的编码规范
2. 充分利用现有的代码结构
3. 添加必要的注释和文档
4. 考虑错误处理和边界情况
5. 遵循 SOLID 原则和最佳实践

请生成完整的代码实现："#,
            task.title,
            task.description,
            task.task_type,
            task.priority,
            context.project_root.display(),
            context.current_file.as_ref().map(|p| p.display()),
            self.detect_primary_language(context),
            context.existing_code.imports.join(", "),
            context.existing_code.functions.iter().map(|f| &f.name).collect::<Vec<_>>().join(", "),
            context.existing_code.classes.iter().map(|c| &c.name).collect::<Vec<_>>().join(", "),
            context.existing_code.variables.iter().map(|v| &v.name).collect::<Vec<_>>().join(", "),
            context.coding_standards.naming_style,
            context.coding_standards.indent_style,
            context.coding_standards.max_line_length
        );
        
        Ok(prompt)
    }
    
    async fn generate_initial_code(&self, prompt: &str) -> Result<String, AIError> {
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            temperature: Some(0.3),
            max_tokens: Some(4000),
            stream: Some(false),
        }).await?;
        
        Ok(response.choices[0].message.content.clone())
    }
    
    async fn optimize_code(&self, code: &str, context: &CodeGenerationContext) -> Result<String, OptimizationError> {
        let optimization_prompt = format!(
            r#"请优化以下代码，提高其质量和性能：

原始代码：
{}

优化要求：
1. 提高代码可读性
2. 优化性能
3. 减少重复代码
4. 改善错误处理
5. 遵循最佳实践

请返回优化后的代码："#,
            code
        );
        
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: optimization_prompt,
            }],
            temperature: Some(0.2),
            max_tokens: Some(4000),
            stream: Some(false),
        }).await?;
        
        Ok(response.choices[0].message.content.clone())
    }
}
```

### 3. 持续生成与迭代优化

```rust
// src-tauri/src/code_generation/continuous.rs
pub struct ContinuousCodeGenerator {
    generator: IntelligentCodeGenerator,
    feedback_collector: FeedbackCollector,
    iteration_engine: IterationEngine,
    performance_monitor: PerformanceMonitor,
}

impl ContinuousCodeGenerator {
    pub async fn start_continuous_generation(&self, tasks: Vec<DevelopmentTask>, context: CodeGenerationContext) -> Result<GenerationSession, GenerationError> {
        let session_id = Uuid::new_v4().to_string();
        let session = GenerationSession::new(session_id, tasks.clone(), context.clone());
        
        // 启动持续生成流程
        let session_clone = session.clone();
        let generator_clone = self.generator.clone();
        
        tokio::spawn(async move {
            for (index, task) in tasks.into_iter().enumerate() {
                // 生成代码
                let generated_code = generator_clone.generate_code(&task, &context).await;
                
                match generated_code {
                    Ok(code) => {
                        session_clone.add_generation_result(index, code).await;
                        
                        // 收集反馈
                        let feedback = self.collect_feedback(&code, &context).await;
                        
                        // 如果需要迭代优化
                        if feedback.should_iterate() {
                            let improved_code = self.iterate_improvement(&code, feedback, &context).await;
                            session_clone.update_generation_result(index, improved_code).await;
                        }
                    }
                    Err(e) => {
                        session_clone.add_error(index, e).await;
                    }
                }
                
                // 更新进度
                session_clone.update_progress(index + 1).await;
            }
        });
        
        Ok(session)
    }
    
    async fn collect_feedback(&self, code: &GeneratedCode, context: &CodeGenerationContext) -> CodeFeedback {
        let mut feedback = CodeFeedback::new();
        
        // 1. 静态分析反馈
        let static_analysis = self.perform_static_analysis(&code.code, &code.language).await;
        feedback.add_static_analysis(static_analysis);
        
        // 2. 性能分析反馈
        let performance_analysis = self.analyze_performance(&code.code, &code.language).await;
        feedback.add_performance_analysis(performance_analysis);
        
        // 3. 安全分析反馈
        let security_analysis = self.analyze_security(&code.code, &code.language).await;
        feedback.add_security_analysis(security_analysis);
        
        // 4. 代码风格检查
        let style_check = self.check_code_style(&code.code, &context.coding_standards).await;
        feedback.add_style_check(style_check);
        
        feedback
    }
    
    async fn iterate_improvement(&self, code: &GeneratedCode, feedback: CodeFeedback, context: &CodeGenerationContext) -> Result<GeneratedCode, IterationError> {
        let improvement_prompt = format!(
            r#"基于以下反馈，请改进代码：

原始代码：
{}

质量评分：{}

反馈意见：
{}

请提供改进后的代码，确保：
1. 解决所有反馈中的问题
2. 保持原有功能不变
3. 提高代码质量
4. 添加必要的注释说明改进点："#,
            code.code,
            code.quality_score,
            feedback.summary()
        );
        
        let response = self.generator.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: improvement_prompt,
            }],
            temperature: Some(0.2),
            max_tokens: Some(4000),
            stream: Some(false),
        }).await?;
        
        let improved_code = response.choices[0].message.content.clone();
        
        // 验证改进后的代码
        self.generator.code_validator.validate(&improved_code, context).await?;
        
        Ok(GeneratedCode {
            code: improved_code,
            quality_score: code.quality_score + 0.1, // 假设质量提升了
            generation_time: SystemTime::now(),
            context_used: context.clone(),
            task_id: code.task_id.clone(),
        })
    }
}

#[derive(Debug, Clone)]
pub struct GenerationSession {
    pub id: String,
    pub tasks: Vec<DevelopmentTask>,
    pub context: CodeGenerationContext,
    pub results: Arc<Mutex<HashMap<usize, GenerationResult>>>,
    pub progress: Arc<AtomicUsize>,
    pub status: Arc<Mutex<SessionStatus>>,
}

#[derive(Debug, Clone)]
pub enum GenerationResult {
    Success(GeneratedCode),
    Error(GenerationError),
    Pending,
}

#[derive(Debug, Clone)]
pub enum SessionStatus {
    Running,
    Completed,
    Failed,
    Cancelled,
}

impl GenerationSession {
    pub async fn get_progress(&self) -> f32 {
        let current = self.progress.load(Ordering::Relaxed);
        let total = self.tasks.len();
        current as f32 / total as f32
    }
    
    pub async fn get_result(&self, task_index: usize) -> Option<GenerationResult> {
        self.results.lock().await.get(&task_index).cloned()
    }
    
    pub async fn wait_for_completion(&self) -> Result<Vec<GeneratedCode>, SessionError> {
        loop {
            let status = self.status.lock().await.clone();
            match status {
                SessionStatus::Completed => {
                    let mut successful_results = Vec::new();
                    for result in self.results.lock().await.values() {
                        if let GenerationResult::Success(code) = result {
                            successful_results.push(code.clone());
                        }
                    }
                    return Ok(successful_results);
                }
                SessionStatus::Failed => {
                    return Err(SessionError::GenerationFailed);
                }
                SessionStatus::Cancelled => {
                    return Err(SessionError::Cancelled);
                }
                SessionStatus::Running => {
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    }
}
```

## 🎯 实际使用示例

### 1. 复杂功能开发

```rust
// 用户输入："创建一个用户管理系统，包括注册、登录、权限管理功能"

// 1. 需求分析
let requirement = analyzer.analyze(
    "创建一个用户管理系统，包括注册、登录、权限管理功能".to_string(),
    project_context
).await?;

// 2. 任务拆解
let tasks = decomposer.decompose(requirement).await?;
// 拆解结果：
// - Task 1: 设计数据库模型
// - Task 2: 实现用户注册功能
// - Task 3: 实现用户登录功能
// - Task 4: 实现权限管理系统
// - Task 5: 创建 API 接口
// - Task 6: 编写单元测试
// - Task 7: 编写 API 文档

// 3. 持续代码生成
let session = continuous_generator.start_continuous_generation(tasks, context).await?;

// 4. 监控进度
while session.get_progress().await < 1.0 {
    let progress = session.get_progress().await;
    println!("生成进度: {:.1}%", progress * 100.0);
    tokio::time::sleep(Duration::from_secs(1)).await;
}

// 5. 获取结果
let generated_codes = session.wait_for_completion().await?;
for (index, code) in generated_codes.iter().enumerate() {
    println!("Task {} 生成完成，质量评分: {:.2}", index + 1, code.quality_score);
}
```

### 2. 实时代码优化

```rust
// 用户选择现有代码并请求优化
let optimization_request = OptimizationRequest {
    code: existing_code,
    optimization_goals: vec![
        OptimizationGoal::Performance,
        OptimizationGoal::Readability,
        OptimizationGoal::Maintainability,
    ],
    context: current_context,
};

let optimized_code = generator.optimize_with_feedback(optimization_request).await?;

// 显示优化结果
println!("优化完成，性能提升: {:.1}%", optimized_code.performance_improvement);
println!("代码质量评分: {:.2} -> {:.2}", 
    original_quality, optimized_code.quality_score);
```

## 📊 效果评估指标

### 1. 任务拆解质量
- **拆解准确性**: 拆解的任务是否符合实际开发需求
- **粒度合理性**: 任务大小是否适中，便于实现和测试
- **依赖关系**: 任务依赖关系是否正确

### 2. 代码生成质量
- **功能正确性**: 生成的代码是否实现了预期功能
- **代码质量**: 遵循编码规范，可读性、可维护性
- **性能表现**: 代码执行效率，资源使用情况

### 3. 持续改进效果
- **迭代收敛性**: 经过几轮迭代后代码质量是否提升
- **学习效果**: 系统是否能从历史生成中学习改进
- **用户满意度**: 用户对生成结果的满意度评分

---

## 🚀 分阶段实现计划

### 第一阶段：基础任务拆解框架 (1-2周)

#### 1.1 创建项目结构
```bash
mkdir -p src-tauri/src/task_decomposition
mkdir -p src-tauri/src/code_generation
mkdir -p src-tauri/src/context_analysis
```

#### 1.2 实现需求分析器
```rust
// src-tauri/src/task_decomposition/mod.rs
pub mod analyzer;
pub mod decomposer;
pub mod types;
pub mod classifier;

pub use analyzer::RequirementAnalyzer;
pub use decomposer::TaskDecomposer;
pub use types::*;
pub use classifier::IntentClassifier;

// src-tauri/src/task_decomposition/types.rs
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

// src-tauri/src/task_decomposition/classifier.rs
use regex::Regex;
use super::types::*;

pub struct IntentClassifier {
    patterns: Vec<(Regex, RequirementIntent)>,
}

impl IntentClassifier {
    pub fn new() -> Self {
        let patterns = vec![
            (Regex::new(r"(?i)创建|实现|开发|添加.*功能").unwrap(), RequirementIntent::CreateFeature),
            (Regex::new(r"(?i)修复|解决.*bug|错误").unwrap(), RequirementIntent::FixBug),
            (Regex::new(r"(?i)重构|优化.*代码").unwrap(), RequirementIntent::RefactorCode),
            (Regex::new(r"(?i)测试|单元测试|集成测试").unwrap(), RequirementIntent::AddTests),
            (Regex::new(r"(?i)文档|说明|readme").unwrap(), RequirementIntent::Documentation),
            (Regex::new(r"(?i)性能|优化|加速").unwrap(), RequirementIntent::Optimization),
            (Regex::new(r"(?i)集成|连接.*api").unwrap(), RequirementIntent::Integration),
        ];
        
        Self { patterns }
    }
    
    pub fn classify(&self, text: &str) -> RequirementIntent {
        for (pattern, intent) in &self.patterns {
            if pattern.is_match(text) {
                return intent.clone();
            }
        }
        RequirementIntent::CreateFeature
    }
}

#[tauri::command]
pub async fn classify_requirement(text: String) -> Result<RequirementIntent, String> {
    let classifier = IntentClassifier::new();
    Ok(classifier.classify(&text))
}
```

#### 1.3 实现复杂度评估器
```rust
// src-tauri/src/task_decomposition/analyzer.rs
use super::types::*;
use crate::ai::{create_ai_client, ChatRequest, ChatMessage};
use crate::config::ConfigLoader;

pub struct ComplexityEstimator {
    ai_client: Box<dyn crate::ai::AiClient>,
}

impl ComplexityEstimator {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config = ConfigLoader::load_from_env()?;
        let ai_client = create_ai_client(config.ai);
        Ok(Self { ai_client })
    }
    
    pub async fn estimate(&self, requirement: &str, context: &ProjectContext) -> Result<ComplexityLevel, Box<dyn std::error::Error>> {
        let prompt = format!(
            "请评估以下开发任务的复杂度：

需求：{}
项目类型：{}
技术栈：{}

请根据以下标准评估复杂度：
- Simple: 1-2小时，简单功能实现
- Medium: 1-2天，中等复杂度功能
- Complex: 3-7天，复杂系统功能
- Expert: 需要专家级实现，超过一周

请只返回复杂度级别（Simple/Medium/Complex/Expert）：",
            requirement,
            context.project_type,
            context.tech_stack.join(", ")
        );
        
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-3.5-turbo".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt,
            }],
            temperature: Some(0.1),
            max_tokens: Some(50),
            stream: Some(false),
        }).await?;
        
        let result = response.choices[0].message.content.trim();
        match result.to_lowercase().as_str() {
            "simple" => Ok(ComplexityLevel::Simple),
            "medium" => Ok(ComplexityLevel::Medium),
            "complex" => Ok(ComplexityLevel::Complex),
            "expert" => Ok(ComplexityLevel::Expert),
            _ => Ok(ComplexityLevel::Medium), // 默认值
        }
    }
}

#[tauri::command]
pub async fn estimate_complexity(requirement: String, project_context: ProjectContext) -> Result<ComplexityLevel, String> {
    let estimator = ComplexityEstimator::new().map_err(|e| e.to_string())?;
    estimator.estimate(&requirement, &project_context).await.map_err(|e| e.to_string())
}
```

#### 1.4 集成到主应用
```rust
// src-tauri/src/main.rs 中添加
mod task_decomposition;

use task_decomposition::{classify_requirement, estimate_complexity, RequirementIntent, ComplexityLevel, ProjectContext};

.invoke_handler(tauri::generate_handler![
    // ... 现有命令
    classify_requirement,
    estimate_complexity,
])
```

### 第二阶段：任务拆解核心引擎 (2-3周)

#### 2.1 实现任务拆解器
```rust
// src-tauri/src/task_decomposition/decomposer.rs
use super::types::*;
use crate::ai::{create_ai_client, ChatRequest, ChatMessage};
use serde_json;

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

pub struct TaskDecomposer {
    ai_client: Box<dyn crate::ai::AiClient>,
}

impl TaskDecomposer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config = crate::config::ConfigLoader::load_from_env()?;
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

请提供详细的拆解策略，包括：
1. 主要开发阶段（如：设计、实现、测试、部署）
2. 每个阶段的关键任务
3. 任务之间的依赖关系
4. 预估时间分配

请以结构化的方式返回，每个任务用【】标记："#,
            requirement.raw_text,
            requirement.domain,
            requirement.complexity,
            requirement.context.project_type
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
        let task_descriptions = self.parse_strategy_tasks(strategy).await?;
        
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
}}"#,
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
        
        let task: DevelopmentTask = serde_json::from_str(&response.choices[0].message.content)?;
        Ok(task)
    }
    
    fn parse_strategy_tasks(&self, strategy: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
        let mut tasks = Vec::new();
        
        // 简单的任务解析逻辑
        for line in strategy.lines() {
            if line.starts_with('【') && line.ends_with('】') {
                tasks.push(line.trim_start_matches('【').trim_end_matches('】').to_string());
            }
        }
        
        Ok(tasks)
    }
    
    async fn optimize_dependencies(&self, tasks: Vec<DevelopmentTask>) -> Result<Vec<DevelopmentTask>, Box<dyn std::error::Error>> {
        // 简单的依赖优化逻辑
        // 实际实现中可以使用更复杂的算法
        Ok(tasks)
    }
}

#[tauri::command]
pub async fn decompose_requirement(requirement: UserRequirement) -> Result<Vec<DevelopmentTask>, String> {
    let decomposer = TaskDecomposer::new().map_err(|e| e.to_string())?;
    decomposer.decompose(&requirement).await.map_err(|e| e.to_string())
}
```

#### 2.2 添加到主应用
```rust
// src-tauri/src/main.rs 添加
use task_decomposition::{decompose_requirement, DevelopmentTask};

.invoke_handler(tauri::generate_handler![
    // ... 现有命令
    decompose_requirement,
])
```

### 第三阶段：代码生成上下文管理 (2-3周)

#### 3.1 实现上下文分析器
```rust
// src-tauri/src/context_analysis/mod.rs
pub mod analyzer;
pub mod parser;
pub mod types;

pub use analyzer::ContextManager;
pub use types::*;

// src-tauri/src/context_analysis/types.rs
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CodeGenerationContext {
    pub project_root: PathBuf,
    pub current_file: Option<PathBuf>,
    pub file_tree: FileTree,
    pub dependencies: ProjectDependencies,
    pub coding_standards: CodingStandards,
    pub existing_code: ExistingCodeContext,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileTree {
    pub files: Vec<FileNode>,
    pub directories: Vec<DirectoryNode>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub path: PathBuf,
    pub language: String,
    pub size: u64,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExistingCodeContext {
    pub imports: Vec<String>,
    pub functions: Vec<FunctionSignature>,
    pub classes: Vec<ClassDefinition>,
    pub variables: Vec<VariableDefinition>,
}

// src-tauri/src/context_analysis/analyzer.rs
use super::types::*;
use std::path::Path;
use tokio::fs;

pub struct ContextManager {
    project_root: PathBuf,
}

impl ContextManager {
    pub fn new(project_root: PathBuf) -> Self {
        Self { project_root }
    }
    
    pub async fn build_context(&self, current_file: Option<&Path>) -> Result<CodeGenerationContext, Box<dyn std::error::Error>> {
        // 构建文件树
        let file_tree = self.build_file_tree().await?;
        
        // 分析依赖关系
        let dependencies = self.analyze_dependencies().await?;
        
        // 解析现有代码
        let existing_code = self.analyze_existing_code(&file_tree).await?;
        
        // 检测编码规范
        let coding_standards = self.detect_coding_standards(&file_tree).await?;
        
        Ok(CodeGenerationContext {
            project_root: self.project_root.clone(),
            current_file: current_file.map(|p| p.to_path_buf()),
            file_tree,
            dependencies,
            coding_standards,
            existing_code,
        })
    }
    
    async fn build_file_tree(&self) -> Result<FileTree, Box<dyn std::error::Error>> {
        let mut files = Vec::new();
        let mut directories = Vec::new();
        
        let mut entries = fs::read_dir(&self.project_root).await?;
        
        while let Some(entry) = entries.next_entry().await? {
            let path = entry.path();
            
            if path.is_dir() {
                directories.push(DirectoryNode {
                    path: path.clone(),
                    name: path.file_name().unwrap().to_string_lossy().to_string(),
                });
            } else if path.is_file() {
                let content = fs::read_to_string(&path).await?;
                let language = self.detect_language(&path);
                
                files.push(FileNode {
                    path: path.clone(),
                    language,
                    size: entry.metadata().await?.len(),
                    content,
                });
            }
        }
        
        Ok(FileTree { files, directories })
    }
    
    fn detect_language(&self, path: &Path) -> String {
        if let Some(extension) = path.extension() {
            match extension.to_str().unwrap() {
                "rs" => "rust".to_string(),
                "ts" => "typescript".to_string(),
                "tsx" => "typescript".to_string(),
                "js" => "javascript".to_string(),
                "jsx" => "javascript".to_string(),
                "py" => "python".to_string(),
                "java" => "java".to_string(),
                "cpp" | "cxx" => "cpp".to_string(),
                "c" => "c".to_string(),
                "go" => "go".to_string(),
                _ => "unknown".to_string(),
            }
        } else {
            "unknown".to_string()
        }
    }
    
    async fn analyze_dependencies(&self) -> Result<ProjectDependencies, Box<dyn std::error::Error>> {
        // 简化实现，实际需要解析 package.json, Cargo.toml 等
        Ok(ProjectDependencies {
            npm_packages: Vec::new(),
            cargo_crates: Vec::new(),
            python_packages: Vec::new(),
        })
    }
    
    async fn analyze_existing_code(&self, file_tree: &FileTree) -> Result<ExistingCodeContext, Box<dyn std::error::Error>> {
        let mut imports = Vec::new();
        let mut functions = Vec::new();
        let mut classes = Vec::new();
        let mut variables = Vec::new();
        
        for file in &file_tree.files {
            if file.language == "rust" {
                let parsed = self.parse_rust_file(&file.content)?;
                imports.extend(parsed.imports);
                functions.extend(parsed.functions);
            }
            // 可以添加其他语言的解析
        }
        
        Ok(ExistingCodeContext {
            imports,
            functions,
            classes,
            variables,
        })
    }
    
    fn parse_rust_file(&self, content: &str) -> Result<ParsedCode, Box<dyn std::error::Error>> {
        let mut imports = Vec::new();
        let mut functions = Vec::new();
        
        for line in content.lines() {
            let trimmed = line.trim();
            
            // 解析 import
            if trimmed.starts_with("use ") {
                imports.push(trimmed.to_string());
            }
            
            // 解析函数定义
            if trimmed.starts_with("pub fn ") || trimmed.starts_with("fn ") {
                if let Some(fn_name) = trimmed.split('(').next() {
                    let fn_name = fn_name.replace("pub fn ", "").replace("fn ", "").trim();
                    functions.push(FunctionSignature {
                        name: fn_name.to_string(),
                        parameters: Vec::new(), // 简化实现
                        return_type: None,
                    });
                }
            }
        }
        
        Ok(ParsedCode {
            imports,
            functions,
            classes: Vec::new(),
            variables: Vec::new(),
        })
    }
    
    async fn detect_coding_standards(&self, file_tree: &FileTree) -> Result<CodingStandards, Box<dyn std::error::Error>> {
        // 简化实现，实际需要分析代码风格
        Ok(CodingStandards {
            indent_style: IndentStyle::Spaces(4),
            max_line_length: 100,
            naming_style: NamingStyle::SnakeCase,
        })
    }
}

#[tauri::command]
pub async fn build_generation_context(project_root: String, current_file: Option<String>) -> Result<CodeGenerationContext, String> {
    let manager = ContextManager::new(PathBuf::from(project_root));
    let current_file_path = current_file.map(|s| PathBuf::from(s));
    manager.build_context(current_file_path.as_deref()).await.map_err(|e| e.to_string())
}
```

### 第四阶段：智能代码生成器 (3-4周)

#### 4.1 实现代码生成器
```rust
// src-tauri/src/code_generation/mod.rs
pub mod generator;
pub mod context;
pub mod validator;

pub use generator::IntelligentCodeGenerator;
pub use context::*;
pub use validator::*;

// src-tauri/src/code_generation/generator.rs
use super::context::*;
use crate::ai::{create_ai_client, ChatRequest, ChatMessage};
use crate::task_decomposition::DevelopmentTask;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GeneratedCode {
    pub code: String,
    pub quality_score: f32,
    pub generation_time: chrono::DateTime<chrono::Utc>,
    pub task_id: String,
    pub file_path: String,
    pub language: String,
}

pub struct IntelligentCodeGenerator {
    ai_client: Box<dyn crate::ai::AiClient>,
}

impl IntelligentCodeGenerator {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let config = crate::config::ConfigLoader::load_from_env()?;
        let ai_client = create_ai_client(config.ai);
        Ok(Self { ai_client })
    }
    
    pub async fn generate_code(&self, task: &DevelopmentTask, context: &CodeGenerationContext) -> Result<GeneratedCode, Box<dyn std::error::Error>> {
        // 1. 构建生成提示
        let prompt = self.build_generation_prompt(task, context).await?;
        
        // 2. 生成初始代码
        let initial_code = self.generate_initial_code(&prompt).await?;
        
        // 3. 代码优化
        let optimized_code = self.optimize_code(&initial_code, context).await?;
        
        // 4. 质量评估
        let quality_score = self.assess_code_quality(&optimized_code, context).await?;
        
        Ok(GeneratedCode {
            code: optimized_code,
            quality_score,
            generation_time: chrono::Utc::now(),
            task_id: task.id.clone(),
            file_path: task.required_files.first().unwrap_or(&"generated.rs".to_string()).clone(),
            language: self.detect_language_from_task(task),
        })
    }
    
    async fn build_generation_prompt(&self, task: &DevelopmentTask, context: &CodeGenerationContext) -> Result<String, Box<dyn std::error::Error>> {
        let prompt = format!(
            r#"你是一个专业的软件开发工程师。请根据以下任务和上下文生成高质量的代码：

## 任务信息
标题：{}
描述：{}
类型：{:?}
优先级：{:?}
预估时间：{}分钟

## 项目上下文
项目根目录：{}
当前文件：{:?}
编程语言：{}

## 现有代码结构
导入的模块：{}
已定义的函数：{}
已定义的类：{}

## 验收标准
{}

## 要求
1. 代码必须符合项目的编码规范
2. 充分利用现有的代码结构
3. 添加必要的注释和文档
4. 考虑错误处理和边界情况
5. 遵循 SOLID 原则和最佳实践

请生成完整的代码实现："#,
            task.title,
            task.description,
            task.task_type,
            task.priority,
            task.estimated_time,
            context.project_root.display(),
            context.current_file.as_ref().map(|p| p.display()),
            self.detect_primary_language(context),
            context.existing_code.imports.join(", "),
            context.existing_code.functions.iter().map(|f| &f.name).collect::<Vec<_>>().join(", "),
            context.existing_code.classes.iter().map(|c| &c.name).collect::<Vec<_>>().join(", "),
            task.acceptance_criteria.join(", ")
        );
        
        Ok(prompt)
    }
    
    async fn generate_initial_code(&self, prompt: &str) -> Result<String, Box<dyn std::error::Error>> {
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            temperature: Some(0.3),
            max_tokens: Some(4000),
            stream: Some(false),
        }).await?;
        
        Ok(response.choices[0].message.content.clone())
    }
    
    async fn optimize_code(&self, code: &str, context: &CodeGenerationContext) -> Result<String, Box<dyn std::error::Error>> {
        let optimization_prompt = format!(
            r#"请优化以下代码，提高其质量和性能：

原始代码：
{}

优化要求：
1. 提高代码可读性
2. 优化性能
3. 减少重复代码
4. 改善错误处理
5. 遵循最佳实践

请返回优化后的代码："#,
            code
        );
        
        let response = self.ai_client.chat(ChatRequest {
            model: "gpt-4".to_string(),
            messages: vec![ChatMessage {
                role: "user".to_string(),
                content: optimization_prompt,
            }],
            temperature: Some(0.2),
            max_tokens: Some(4000),
            stream: Some(false),
        }).await?;
        
        Ok(response.choices[0].message.content.clone())
    }
    
    async fn assess_code_quality(&self, code: &str, context: &CodeGenerationContext) -> Result<f32, Box<dyn std::error::Error>> {
        // 简化的质量评估
        let mut score = 0.5; // 基础分数
        
        // 检查代码长度
        if code.len() > 100 {
            score += 0.1;
        }
        
        // 检查是否有注释
        if code.contains("//") || code.contains("/*") {
            score += 0.1;
        }
        
        // 检查错误处理
        if code.contains("Result<") || code.contains("try") || code.contains("catch") {
            score += 0.1;
        }
        
        // 检查函数定义
        if code.contains("fn ") || code.contains("function ") {
            score += 0.1;
        }
        
        Ok(score.min(1.0))
    }
    
    fn detect_primary_language(&self, context: &CodeGenerationContext) -> String {
        // 简化实现，实际需要更复杂的逻辑
        if context.existing_code.functions.iter().any(|f| f.name.contains("rust")) {
            "rust".to_string()
        } else {
            "typescript".to_string()
        }
    }
    
    fn detect_language_from_task(&self, task: &DevelopmentTask) -> String {
        // 根据任务描述和文件名推断语言
        for file in &task.required_files {
            if file.ends_with(".rs") {
                return "rust".to_string();
            } else if file.ends_with(".ts") || file.ends_with(".tsx") {
                return "typescript".to_string();
            } else if file.ends_with(".py") {
                return "python".to_string();
            }
        }
        "typescript".to_string() // 默认
    }
}

#[tauri::command]
pub async fn generate_code_for_task(task: DevelopmentTask, context: CodeGenerationContext) -> Result<GeneratedCode, String> {
    let generator = IntelligentCodeGenerator::new().map_err(|e| e.to_string())?;
    generator.generate_code(&task, &context).await.map_err(|e| e.to_string())
}
```

### 第五阶段：完整工作流集成 (2-3周)

#### 5.1 实现完整工作流
```rust
// src-tauri/src/task_decomposition/workflow.rs
use super::*;
use crate::code_generation::*;
use crate::context_analysis::*;

pub struct DevelopmentWorkflow {
    analyzer: RequirementAnalyzer,
    decomposer: TaskDecomposer,
    context_manager: ContextManager,
    code_generator: IntelligentCodeGenerator,
}

impl DevelopmentWorkflow {
    pub fn new(project_root: String) -> Result<Self, Box<dyn std::error::Error>> {
        let analyzer = RequirementAnalyzer::new();
        let decomposer = TaskDecomposer::new()?;
        let context_manager = ContextManager::new(std::path::PathBuf::from(project_root));
        let code_generator = IntelligentCodeGenerator::new()?;
        
        Ok(Self {
            analyzer,
            decomposer,
            context_manager,
            code_generator,
        })
    }
    
    pub async fn execute_workflow(&self, requirement_text: String) -> Result<WorkflowResult, Box<dyn std::error::Error>> {
        // 1. 分析需求
        let context = self.context_manager.build_context(None).await?;
        let requirement = self.analyzer.analyze(requirement_text, context.clone()).await?;
        
        // 2. 拆解任务
        let tasks = self.decomposer.decompose(&requirement).await?;
        
        // 3. 生成代码
        let mut generated_codes = Vec::new();
        for task in tasks {
            let code = self.code_generator.generate_code(&task, &context).await?;
            generated_codes.push((task, code));
        }
        
        Ok(WorkflowResult {
            requirement,
            generated_codes,
            execution_time: chrono::Utc::now(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowResult {
    pub requirement: UserRequirement,
    pub generated_codes: Vec<(DevelopmentTask, GeneratedCode)>,
    pub execution_time: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
pub async fn execute_development_workflow(requirement: String, project_root: String) -> Result<WorkflowResult, String> {
    let workflow = DevelopmentWorkflow::new(project_root).map_err(|e| e.to_string())?;
    workflow.execute_workflow(requirement).await.map_err(|e| e.to_string())
}
```

#### 5.2 添加所有命令到主应用
```rust
// src-tauri/src/main.rs 添加所有新命令
mod context_analysis;
mod code_generation;
mod task_decomposition;

use context_analysis::build_generation_context;
use code_generation::generate_code_for_task;
use task_decomposition::{
    classify_requirement, 
    estimate_complexity, 
    decompose_requirement,
    execute_development_workflow,
    UserRequirement, 
    DevelopmentTask,
    CodeGenerationContext,
    WorkflowResult
};

.invoke_handler(tauri::generate_handler![
    // 现有命令...
    classify_requirement,
    estimate_complexity,
    decompose_requirement,
    build_generation_context,
    generate_code_for_task,
    execute_development_workflow,
])
```

## 🧪 测试实现

### 创建测试文件
```rust
// src-tauri/src/task_decomposition/tests.rs
#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_requirement_classification() {
        let classifier = IntentClassifier::new();
        
        assert!(matches!(classifier.classify("创建一个用户登录功能"), RequirementIntent::CreateFeature));
        assert!(matches!(classifier.classify("修复登录页面的bug"), RequirementIntent::FixBug));
        assert!(matches!(classifier.classify("重构用户管理模块"), RequirementIntent::RefactorCode));
    }
    
    #[tokio::test]
    async fn test_task_decomposition() {
        let requirement = UserRequirement {
            id: "test-1".to_string(),
            raw_text: "创建一个简单的用户注册功能".to_string(),
            intent: RequirementIntent::CreateFeature,
            complexity: ComplexityLevel::Simple,
            domain: DomainType::Backend,
            context: ProjectContext {
                project_root: "/test".into(),
                project_type: "web".to_string(),
                tech_stack: vec!["rust".to_string(), "postgres".to_string()],
                existing_files: Vec::new(),
                dependencies: Vec::new(),
            },
            created_at: chrono::Utc::now(),
        };
        
        let decomposer = TaskDecomposer::new().unwrap();
        let tasks = decomposer.decompose(&requirement).await.unwrap();
        
        assert!(!tasks.is_empty());
        assert!(tasks.iter().any(|t| t.title.contains("注册")));
    }
}
```

## 📋 实现检查清单

### 第一阶段检查点
- [ ] 创建任务拆解模块结构
- [ ] 实现需求意图分类器
- [ ] 实现复杂度评估器
- [ ] 添加 Tauri 命令接口
- [ ] 编写基础单元测试

### 第二阶段检查点
- [ ] 实现任务拆解器核心逻辑
- [ ] 集成 AI 调用进行智能拆解
- [ ] 实现任务依赖关系分析
- [ ] 添加任务类型和优先级评估
- [ ] 完善错误处理

### 第三阶段检查点
- [ ] 实现项目上下文分析
- [ ] 构建文件树解析器
- [ ] 实现代码结构分析
- [ ] 检测编码规范
- [ ] 缓存上下文信息

### 第四阶段检查点
- [ ] 实现智能代码生成器
- [ ] 构建上下文感知的提示系统
- [ ] 实现代码优化和质量评估
- [ ] 添加多语言支持
- [ ] 实现代码验证

### 第五阶段检查点
- [ ] 集成完整工作流
- [ ] 实现端到端测试
- [ ] 添加性能监控
- [ ] 优化用户体验
- [ ] 完善文档和示例

---

*这个分阶段实现计划让你可以逐步构建整个系统，每个阶段都有明确的交付物和验收标准。*
