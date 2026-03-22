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
    
    // 添加置信度评分
    pub fn classify_with_confidence(&self, text: &str) -> (RequirementIntent, f32) {
        for (pattern, intent) in &self.patterns {
            if pattern.is_match(text) {
                // 简单的置信度计算：基于匹配的关键词数量
                let confidence = self.calculate_confidence(text, pattern);
                return (intent.clone(), confidence);
            }
        }
        (RequirementIntent::CreateFeature, 0.3) // 默认低置信度
    }
    
    fn calculate_confidence(&self, text: &str, _pattern: &Regex) -> f32 {
        let mut confidence = 0.5; // 基础置信度
        
        // 检查是否有多个关键词匹配
        let keywords = vec!["创建", "实现", "开发", "修复", "重构", "测试", "文档", "优化", "集成"];
        let matched_keywords: Vec<_> = keywords.iter()
            .filter(|&keyword| text.to_lowercase().contains(&keyword.to_lowercase()))
            .collect();
        
        confidence += matched_keywords.len() as f32 * 0.1;
        
        // 检查文本长度（更详细的描述通常置信度更高）
        if text.len() > 50 {
            confidence += 0.1;
        }
        
        confidence.min(1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_classify_create_feature() {
        let classifier = IntentClassifier::new();
        
        assert!(matches!(classifier.classify("创建一个用户登录功能"), RequirementIntent::CreateFeature));
        assert!(matches!(classifier.classify("实现新的API接口"), RequirementIntent::CreateFeature));
        assert!(matches!(classifier.classify("开发数据管理模块"), RequirementIntent::CreateFeature));
    }
    
    #[test]
    fn test_classify_fix_bug() {
        let classifier = IntentClassifier::new();
        
        assert!(matches!(classifier.classify("修复登录页面的bug"), RequirementIntent::FixBug));
        assert!(matches!(classifier.classify("解决数据同步错误"), RequirementIntent::FixBug));
    }
    
    #[test]
    fn test_classify_refactor() {
        let classifier = IntentClassifier::new();
        
        assert!(matches!(classifier.classify("重构用户管理模块"), RequirementIntent::RefactorCode));
        assert!(matches!(classifier.classify("优化代码结构"), RequirementIntent::RefactorCode));
    }
    
    #[test]
    fn test_classify_with_confidence() {
        let classifier = IntentClassifier::new();
        
        let (intent, confidence) = classifier.classify_with_confidence("创建一个完整的用户管理系统，包括注册、登录、权限管理等功能");
        assert!(matches!(intent, RequirementIntent::CreateFeature));
        assert!(confidence > 0.6); // 应该有较高的置信度
    }
    
    #[test]
    fn test_default_classification() {
        let classifier = IntentClassifier::new();
        
        assert!(matches!(classifier.classify("随便写点什么"), RequirementIntent::CreateFeature));
    }
}
