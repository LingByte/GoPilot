# GoPilot AI 编码助手 - 快速开始指南

## 🚀 快速上手

### 前置要求

- **Rust** 1.70+ 
- **Node.js** 18+
- **Git**

### 安装步骤

#### 1. 克隆项目
```bash
git clone https://github.com/your-org/gopilot.git
cd gopilot
```

#### 2. 安装依赖
```bash
# 安装 Rust 依赖
cd src-tauri
cargo build

# 安装 Node.js 依赖
cd ..
npm install
```

#### 3. 配置 AI 服务
```bash
# 复制配置文件
cp src-tauri/.env.example src-tauri/.env

# 编辑配置文件
# 设置你的 AI 服务配置
```

#### 4. 启动开发服务器
```bash
npm run tauri dev
```

## ⚙️ 配置指南

### OpenAI 配置
```env
# src-tauri/.env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4
```

### 阿里云 DashScope 配置
```env
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=your-dashscope-api-key
AI_MODEL=qwen-turbo
```

### Ollama 本地配置
```env
AI_PROVIDER=Ollama
AI_BASE_URL=http://localhost:11434
AI_MODEL=llama2
```

## 🎯 核心功能使用

### 1. 代码补全

在编辑器中输入代码，AI 会自动提供补全建议：

```typescript
// 输入: function calculateSum(
// AI 会自动补全:
function calculateSum(a: number, b: number): number {
    return a + b;
}
```

### 2. 代码生成

在 AI 面板中输入自然语言描述：

```
用户: 创建一个计算斐波那契数列的函数

AI: 
```typescript
function fibonacci(n: number): number {
    if (n <= 1) return n;
    return fibonacci(n - 1) + fibonacci(n - 2);
}

// 优化版本（使用动态规划）
function fibonacciDP(n: number): number {
    if (n <= 1) return n;
    
    let dp = [0, 1];
    for (let i = 2; i <= n; i++) {
        dp[i] = dp[i - 1] + dp[i - 2];
    }
    return dp[n];
}
```

### 3. 代码解释

选中代码后，在 AI 面板询问：

```
用户: 解释这段代码的作用

AI: 这段代码实现了快速排序算法：
1. 选择基准元素（pivot）
2. 将数组分为小于和大于基准的两部分
3. 递归排序两部分
4. 合并结果

时间复杂度：O(n log n) 平均情况
空间复杂度：O(log n) 递归栈空间
```

### 4. 错误修复

遇到编译错误时，AI 会提供修复建议：

```typescript
// 错误代码
const result = calculateSum(5, "10");

// AI 建议修复
const result = calculateSum(5, 10); // 移除字符串引号
// 或
const result = calculateSum(5, parseInt("10")); // 转换字符串为数字
```

## 🛠️ 开发指南

### 项目结构
```
GoPilot/
├── src-tauri/                 # Rust 后端
│   ├── src/
│   │   ├── ai/               # AI 模块
│   │   ├── config/           # 配置管理
│   │   ├── editor/           # 编辑器核心
│   │   └── main.rs          # 主入口
│   └── Cargo.toml           # Rust 依赖
├── src/                      # React 前端
│   ├── components/
│   │   ├── editor/           # 编辑器组件
│   │   ├── ai-panel/         # AI 面板
│   │   └── settings/         # 设置界面
│   └── App.tsx              # 主应用
├── docs/                     # 文档
└── public/                   # 静态资源
```

### 添加新的 AI 功能

#### 1. 定义 Rust 接口
```rust
// src-tauri/src/ai/new_feature.rs
#[tauri::command]
async fn ai_new_feature(request: NewFeatureRequest) -> Result<NewFeatureResponse, String> {
    let client = create_ai_client(get_ai_config()?);
    let response = client.new_feature(request).await?;
    Ok(response)
}
```

#### 2. 注册命令
```rust
// src-tauri/src/main.rs
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    ai_new_feature,
])
```

#### 3. 创建前端组件
```typescript
// src/components/new-feature/NewFeaturePanel.tsx
export const NewFeaturePanel: React.FC = () => {
  const [result, setResult] = useState<string>('');
  
  const handleExecute = async () => {
    const response = await invoke('ai_new_feature', { /* 参数 */ });
    setResult(response);
  };
  
  return (
    <div>
      <button onClick={handleExecute}>执行新功能</button>
      <div>{result}</div>
    </div>
  );
};
```

### 测试新功能

#### 1. 单元测试
```rust
#[cfg(test)]
mod tests {
    #[tokio::test]
    async fn test_new_feature() {
        let request = NewFeatureRequest {
            // 测试参数
        };
        
        let result = ai_new_feature(request).await;
        assert!(result.is_ok());
    }
}
```

#### 2. 集成测试
```typescript
// src/tests/new-feature.test.ts
test('new feature integration', async () => {
  const result = await invoke('ai_new_feature', { /* 参数 */ });
  expect(result).toBeDefined();
});
```

## 🔧 调试指南

### 1. 启用调试模式
```env
# src-tauri/.env
APP_DEBUG=true
APP_LOG_LEVEL=debug
```

### 2. 查看日志
```bash
# 查看后端日志
cargo run -- --verbose

# 查看前端日志
npm run tauri dev -- --log-level debug
```

### 3. 常见问题

#### 问题：AI 响应慢
**解决方案**：
1. 检查网络连接
2. 尝试切换到本地模型（Ollama）
3. 启用缓存功能

#### 问题：代码补全不准确
**解决方案**：
1. 增加上下文信息
2. 调整 AI 模型参数
3. 提供更多示例代码

#### 问题：内存占用过高
**解决方案**：
1. 清理缓存
2. 调整缓存大小
3. 重启应用

## 📚 进阶功能

### 1. 自定义 AI 提示词

```rust
// src-tauri/src/ai/prompts.rs
pub struct PromptTemplates {
    pub code_completion: String,
    pub code_generation: String,
    pub code_explanation: String,
}

impl Default for PromptTemplates {
    fn default() -> Self {
        Self {
            code_completion: "请根据以下代码上下文，提供准确的代码补全建议：\n\n{context}\n\n当前位置：{position}".to_string(),
            code_generation: "请根据以下要求生成{language}代码：\n\n{prompt}\n\n上下文：{context}".to_string(),
            code_explanation: "请解释以下{language}代码的功能：\n\n{code}".to_string(),
        }
    }
}
```

### 2. 插件系统

```rust
// src-tauri/src/plugins/mod.rs
pub trait Plugin: Send + Sync {
    fn name(&self) -> &str;
    fn version(&self) -> &str;
    fn initialize(&mut self) -> Result<(), PluginError>;
    fn handle_request(&self, request: &PluginRequest) -> Result<PluginResponse, PluginError>;
}

pub struct PluginManager {
    plugins: HashMap<String, Box<dyn Plugin>>,
}

impl PluginManager {
    pub fn load_plugin(&mut self, plugin: Box<dyn Plugin>) -> Result<(), PluginError> {
        let name = plugin.name().to_string();
        plugin.initialize()?;
        self.plugins.insert(name, plugin);
        Ok(())
    }
}
```

### 3. 多语言支持

```rust
// src-tauri/src/i18n/mod.rs
pub struct I18nManager {
    locales: HashMap<String, Locale>,
    current_locale: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Locale {
    pub code: String,
    pub name: String,
    pub messages: HashMap<String, String>,
}

impl I18nManager {
    pub fn t(&self, key: &str) -> String {
        self.current_locale
            .messages
            .get(key)
            .cloned()
            .unwrap_or_else(|| key.to_string())
    }
}
```

## 🚀 部署指南

### 1. 构建生产版本
```bash
# 构建前端
npm run build

# 构建后端
cd src-tauri
cargo build --release

# 打包应用
npm run tauri build
```

### 2. 配置生产环境
```env
# 生产环境配置
APP_DEBUG=false
APP_LOG_LEVEL=info
AI_PROVIDER=OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=${AI_API_KEY}
AI_MODEL=gpt-4
```

### 3. Docker 部署
```dockerfile
# Dockerfile
FROM rust:1.70 as rust-builder
WORKDIR /app
COPY src-tauri ./src-tauri
RUN cd src-tauri && cargo build --release

FROM node:18 as node-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates
COPY --from=rust-builder /app/src-tauri/target/release/gopilot /usr/local/bin/
COPY --from=node-builder /app/dist /var/www/
EXPOSE 8080
CMD ["gopilot"]
```

## 🤝 贡献指南

### 1. 开发流程
1. Fork 项目
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 创建 Pull Request

### 2. 代码规范
- Rust: 使用 `cargo fmt` 和 `cargo clippy`
- TypeScript: 使用 ESLint 和 Prettier
- 提交信息：遵循 Conventional Commits

### 3. 测试要求
- 所有新功能必须有单元测试
- 集成测试覆盖率不低于 80%
- 性能测试通过基准要求

## 📞 获取帮助

- **文档**: https://docs.gopilot.dev
- **社区**: https://github.com/your-org/gopilot/discussions
- **问题反馈**: https://github.com/your-org/gopilot/issues
- **邮件**: support@gopilot.dev

---

*开始你的 AI 编程之旅吧！如果遇到任何问题，欢迎随时联系我们。* 🚀
