# AI 服务配置指南

## ❌ 常见错误

如果您看到以下错误：
```
抱歉，连接 AI 服务时出现错误。请检查您的网络连接和 AI 配置。
```

这表示 AI 服务尚未正确配置。

## 🔧 配置步骤

### 1. 创建配置文件

在 `src-tauri/` 目录下创建 `.env` 文件：

```bash
# 复制示例配置文件
cp src-tauri/.env.example src-tauri/.env
```

### 2. 配置 AI 服务

编辑 `src-tauri/.env` 文件，根据您使用的 AI 服务提供商进行配置：

#### 🌟 选项 1：使用阿里云通义千问（推荐，免费）

```env
# AI 配置
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=your-dashscope-api-key
AI_MODEL=qwen-turbo
```

获取 API 密钥：
1. 访问 [阿里云百炼平台](https://bailian.console.aliyun.com/)
2. 注册并登录
3. 在 API-KEY 管理中创建新的 API 密钥
4. 将密钥填入 `AI_API_KEY`

#### 🤖 选项 2：使用 OpenAI GPT

```env
# AI 配置
AI_PROVIDER=OpenAI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-3.5-turbo
```

获取 API 密钥：
1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册并登录
3. 在 API Keys 页面创建新的密钥
4. 将密钥填入 `AI_API_KEY`

#### 🦙 选项 3：使用本地 Ollama（完全免费）

```env
# AI 配置
AI_PROVIDER=Ollama
AI_BASE_URL=http://localhost:11434
AI_API_KEY=ollama
AI_MODEL=llama2
```

使用 Ollama：
1. 下载并安装 [Ollama](https://ollama.ai/)
2. 启动 Ollama 服务
3. 下载模型：`ollama pull llama2`
4. 确保 Ollama 在后台运行

### 3. 重启应用

配置完成后，重启 GoPilot 应用：

```bash
# 停止当前运行的应用
# 然后重新启动
npm run tauri:dev
```

## 🧪 测试配置

配置完成后，您可以在 AI 面板中测试连接：

1. 打开 AI 面板
2. 输入简单的测试消息，如："你好"
3. 如果配置正确，AI 应该会回复

## 🛠️ 故障排除

### 问题 1：仍然显示连接错误

**可能原因**：
- API 密钥无效
- 网络连接问题
- AI 服务不可用

**解决方案**：
1. 检查 API 密钥是否正确复制
2. 确认网络连接正常
3. 尝试更换 AI 模型

### 问题 2：Ollama 连接失败

**可能原因**：
- Ollama 服务未启动
- 端口被占用
- 模型未下载

**解决方案**：
1. 确保 Ollama 正在运行：`ollama serve`
2. 检查端口：`netstat -an | grep 11434`
3. 下载模型：`ollama pull llama2`

### 问题 3：阿里云 API 调用失败

**可能原因**：
- API 密钥格式错误
- 账户余额不足
- 模型名称错误

**解决方案**：
1. 确认 API 密钥格式（通常以 `sk-` 开头）
2. 检查账户余额和配额
3. 使用正确的模型名称：`qwen-turbo`、`qwen-plus`、`qwen-max`

## 🎯 推荐配置

对于大多数用户，推荐使用阿里云通义千问：

```env
# 推荐配置 - 阿里云通义千问
AI_PROVIDER=OpenAI
AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
AI_API_KEY=sk-your-dashscope-key-here
AI_MODEL=qwen-turbo
```

**优势**：
- 🆓 免费额度充足
- 🚀 响应速度快
- 🇨🇳 中文支持优秀
- 🔒 稳定可靠

## 📝 配置验证

创建配置后，可以通过以下方式验证：

1. **查看日志**：在开发者工具中查看网络请求
2. **测试命令**：在终端中测试 API 连接
3. **简单对话**：在 AI 面板中发送 "你好" 测试

## 🆘 获取帮助

如果配置过程中遇到问题：

1. **查看文档**：阅读详细的配置说明
2. **检查日志**：查看控制台错误信息
3. **社区支持**：在项目 Issues 中寻求帮助

---

**配置完成后，您就可以享受 AI 编程助手带来的便利了！** 🚀
