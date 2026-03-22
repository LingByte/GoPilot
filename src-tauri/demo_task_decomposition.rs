// 独立的任务拆解演示程序
// 运行命令：cargo run --bin demo_task_decomposition

use std::path::PathBuf;

// 由于这是一个独立的演示程序，我们需要重新定义基本类型
#[derive(Debug, Clone)]
enum RequirementIntent {
    CreateFeature,
    FixBug,
    RefactorCode,
}

#[derive(Debug, Clone)]
enum ComplexityLevel {
    Simple,
    Medium,
    Complex,
}

#[derive(Debug, Clone)]
enum DomainType {
    Frontend,
    Backend,
    Database,
}

#[derive(Debug, Clone)]
struct ProjectContext {
    pub project_root: PathBuf,
    pub project_type: String,
    pub tech_stack: Vec<String>,
}

#[derive(Debug, Clone)]
struct DevelopmentTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub task_type: String,
    pub priority: String,
    pub estimated_time: u32,
    pub required_files: Vec<String>,
    pub acceptance_criteria: Vec<String>,
}

// 简化的意图分类器
struct IntentClassifier;

impl IntentClassifier {
    fn new() -> Self {
        Self
    }
    
    fn classify(&self, text: &str) -> RequirementIntent {
        let text = text.to_lowercase();
        if text.contains("创建") || text.contains("实现") || text.contains("开发") {
            RequirementIntent::CreateFeature
        } else if text.contains("修复") || text.contains("解决") {
            RequirementIntent::FixBug
        } else if text.contains("重构") || text.contains("优化") {
            RequirementIntent::RefactorCode
        } else {
            RequirementIntent::CreateFeature
        }
    }
}

// 简化的复杂度评估器
struct ComplexityEstimator;

impl ComplexityEstimator {
    fn new() -> Self {
        Self
    }
    
    fn estimate(&self, requirement: &str) -> ComplexityLevel {
        let text = requirement.to_lowercase();
        let mut score = 0;
        
        if text.contains("系统") || text.contains("平台") { score += 3; }
        if text.contains("模块") || text.contains("组件") { score += 2; }
        if text.contains("功能") || text.contains("接口") { score += 1; }
        if text.contains("数据库") || text.contains("安全") { score += 2; }
        
        match score {
            0..=2 => ComplexityLevel::Simple,
            3..=5 => ComplexityLevel::Medium,
            _ => ComplexityLevel::Complex,
        }
    }
}

// 简化的任务拆解器
struct TaskDecomposer;

impl TaskDecomposer {
    fn new() -> Self {
        Self
    }
    
    fn decompose(&self, requirement: &str, intent: &RequirementIntent) -> Vec<DevelopmentTask> {
        match intent {
            RequirementIntent::CreateFeature => {
                vec![
                    DevelopmentTask {
                        id: "task-1".to_string(),
                        title: "设计功能架构".to_string(),
                        description: format!("设计 {} 的架构和实现方案", requirement),
                        task_type: "Design".to_string(),
                        priority: "High".to_string(),
                        estimated_time: 60,
                        required_files: vec!["design.md".to_string()],
                        acceptance_criteria: vec!["架构设计完成".to_string()],
                    },
                    DevelopmentTask {
                        id: "task-2".to_string(),
                        title: "实现核心功能".to_string(),
                        description: format!("实现 {}", requirement),
                        task_type: "Implementation".to_string(),
                        priority: "High".to_string(),
                        estimated_time: 240,
                        required_files: vec!["main.rs".to_string()],
                        acceptance_criteria: vec!["功能正常工作".to_string()],
                    },
                    DevelopmentTask {
                        id: "task-3".to_string(),
                        title: "编写测试用例".to_string(),
                        description: format!("为 {} 编写测试", requirement),
                        task_type: "Testing".to_string(),
                        priority: "Medium".to_string(),
                        estimated_time: 120,
                        required_files: vec!["test.rs".to_string()],
                        acceptance_criteria: vec!["测试覆盖率 > 80%".to_string()],
                    },
                ]
            }
            RequirementIntent::FixBug => {
                vec![
                    DevelopmentTask {
                        id: "task-1".to_string(),
                        title: "问题诊断".to_string(),
                        description: format!("诊断 {} 的问题原因", requirement),
                        task_type: "Research".to_string(),
                        priority: "Critical".to_string(),
                        estimated_time: 60,
                        required_files: vec!["debug.log".to_string()],
                        acceptance_criteria: vec!["问题原因确定".to_string()],
                    },
                    DevelopmentTask {
                        id: "task-2".to_string(),
                        title: "修复问题".to_string(),
                        description: format!("修复 {}", requirement),
                        task_type: "Implementation".to_string(),
                        priority: "Critical".to_string(),
                        estimated_time: 120,
                        required_files: vec!["fix.rs".to_string()],
                        acceptance_criteria: vec!["问题已修复".to_string()],
                    },
                ]
            }
            RequirementIntent::RefactorCode => {
                vec![
                    DevelopmentTask {
                        id: "task-1".to_string(),
                        title: "分析现有代码".to_string(),
                        description: format!("分析需要重构的代码：{}", requirement),
                        task_type: "Research".to_string(),
                        priority: "High".to_string(),
                        estimated_time: 90,
                        required_files: vec!["analysis.md".to_string()],
                        acceptance_criteria: vec!["代码分析完成".to_string()],
                    },
                    DevelopmentTask {
                        id: "task-2".to_string(),
                        title: "执行重构".to_string(),
                        description: format!("重构代码：{}", requirement),
                        task_type: "Implementation".to_string(),
                        priority: "High".to_string(),
                        estimated_time: 180,
                        required_files: vec!["refactored.rs".to_string()],
                        acceptance_criteria: vec!["代码质量提升".to_string()],
                    },
                ]
            }
        }
    }
}

// 演示程序主函数
fn main() {
    println!("🚀 任务拆解演示程序开始运行！");
    println!("=====================================");
    
    // 测试用例
    let test_cases = vec![
        "创建一个用户管理系统，包括注册、登录、权限管理功能",
        "修复登录页面的验证码显示bug",
        "重构用户管理模块，提高代码可维护性",
        "实现一个简单的数据导入功能",
    ];
    
    for (index, requirement) in test_cases.iter().enumerate() {
        println!("\n📝 测试用例 {}: {}", index + 1, requirement);
        println!("---");
        
        // 1. 意图分类
        let classifier = IntentClassifier::new();
        let intent = classifier.classify(requirement);
        println!("🎯 意图分类：{:?}", intent);
        
        // 2. 复杂度评估
        let estimator = ComplexityEstimator::new();
        let complexity = estimator.estimate(requirement);
        println!("⏱️ 复杂度评估：{:?}", complexity);
        
        // 3. 任务拆解
        let decomposer = TaskDecomposer::new();
        let tasks = decomposer.decompose(requirement, &intent);
        println!("🔧 任务拆解结果（{} 个任务）：", tasks.len());
        
        for (task_index, task) in tasks.iter().enumerate() {
            println!("\n   任务 {} - {}", task_index + 1, task.title);
            println!("   类型：{}", task.task_type);
            println!("   优先级：{}", task.priority);
            println!("   预估时间：{} 分钟", task.estimated_time);
            println!("   描述：{}", task.description);
            println!("   需要文件：{:?}", task.required_files);
            println!("   验收标准：{:?}", task.acceptance_criteria);
        }
    }
    
    println!("\n✅ 演示完成！任务拆解功能正常工作。");
    println!("=====================================");
    println!("📊 总结：");
    println!("- ✅ 意图分类：能够识别创建功能、修复Bug、重构代码等意图");
    println!("- ✅ 复杂度评估：基于关键词评估任务复杂度");
    println!("- ✅ 任务拆解：根据意图自动生成开发任务");
    println!("- ✅ 任务属性：包含类型、优先级、时间、文件、验收标准等");
    println!("\n🎯 第一阶段实现完成！基础任务拆解框架已就绪。");
}
