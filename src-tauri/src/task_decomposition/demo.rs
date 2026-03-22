use super::*;
use std::path::PathBuf;

pub async fn run_demo() -> Result<(), Box<dyn std::error::Error>> {
    println!("🚀 任务拆解演示程序开始运行！");
    
    // 1. 创建测试需求
    let requirement_text = "创建一个用户管理系统，包括用户注册、登录、权限管理功能".to_string();
    let project_context = ProjectContext {
        project_root: PathBuf::from("/demo/project"),
        project_type: "web".to_string(),
        tech_stack: vec!["rust".to_string(), "postgres".to_string(), "react".to_string()],
        existing_files: vec!["main.rs".to_string()],
        dependencies: vec!["serde".to_string(), "tokio".to_string()],
    };
    
    println!("\n📝 原始需求：{}", requirement_text);
    
    // 2. 意图分类
    let classifier = IntentClassifier::new();
    let intent = classifier.classify(&requirement_text);
    println!("🎯 意图分类：{:?}", intent);
    
    // 3. 复杂度评估
    let estimator = ComplexityEstimator::new()?;
    let complexity = estimator.quick_estimate(&requirement_text);
    println!("⏱️ 复杂度评估：{:?}", complexity);
    
    // 4. 需求分析
    let analyzer = RequirementAnalyzer::new()?;
    let user_requirement = analyzer.analyze(requirement_text.clone(), project_context.clone()).await?;
    println!("📊 需求分析完成：");
    println!("   - ID: {}", user_requirement.id);
    println!("   - 意图：{:?}", user_requirement.intent);
    println!("   - 复杂度：{:?}", user_requirement.complexity);
    println!("   - 领域：{:?}", user_requirement.domain);
    
    // 5. 任务拆解（简单版本，不需要 AI）
    let decomposer = TaskDecomposer::new()?;
    let tasks = decomposer.simple_decompose(&user_requirement);
    println!("\n🔧 任务拆解结果（{} 个任务）：", tasks.len());
    
    for (index, task) in tasks.iter().enumerate() {
        println!("\n任务 {} - {}", index + 1, task.title);
        println!("   类型：{:?}", task.task_type);
        println!("   优先级：{:?}", task.priority);
        println!("   预估时间：{} 分钟", task.estimated_time);
        println!("   描述：{}", task.description);
        println!("   需要文件：{:?}", task.required_files);
        println!("   验收标准：{:?}", task.acceptance_criteria);
        if !task.dependencies.is_empty() {
            println!("   依赖：{:?}", task.dependencies);
        }
    }
    
    println!("\n✅ 演示完成！任务拆解功能正常工作。");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_demo() {
        let result = run_demo().await;
        assert!(result.is_ok());
    }
}
