# AI 故障排除指南

## ❌ 常见问题

### 问题 1：AI 显示"未配置"状态

**症状**：AI 面板标题栏显示橙色警告图标和"未配置"文字

**原因**：AI 服务尚未配置或配置文件不存在

**解决方案**：
```bash
# 方法 1：使用配置助手（推荐）
npm run setup-ai

# 方法 2：手动创建配置文件
cp src-tauri/.env.example src-tauri/.env
# 编辑 src-tauri/.env 文件，填入 AI 配置
```

### 问题 2：聊天时显示"连接失败"

**症状**：发送消息后返回连接错误提示

**可能原因及解决方案**：

#### 2.1 API 密钥问题
- **检查**：API 密钥是否正确复制
- **解决**：重新获取 API 密钥并更新配置

#### 2.2 网络连接问题
- **检查**：网络是否正常，能否访问 AI 服务
- **解决**：检查防火墙设置，尝试切换网络

#### 2.3 AI 服务不可用
- **检查**：AI 服务提供商是否正常运行
- **解决**：等待服务恢复或更换提供商

#### 2.4 配置格式错误
- **检查**：`.env` 文件格式是否正确
- **解决**：使用配置助手重新生成配置

### 问题 3：Ollama 连接失败

**症状**：使用 Ollama 时无法连接

**解决方案**：
```bash
# 1. 确保 Ollama 已安装
ollama --version

# 2. 启动 Ollama 服务
ollama serve

# 3. 下载模型
ollama pull llama2

# 4. 测试连接
curl http://localhost:11434/api/generate -d '{
  "model": "llama2",
  "prompt": "Hello"
}'
```

### 问题 4：任务拆解功能异常

**症状**：任务拆解返回错误或无响应

**解决方案**：
1. 检查 AI 配置是否正确
2. 确保网络连接正常
3. 尝试简化需求描述
4. 检查后端日志是否有错误

## 🔧 诊断步骤

### 步骤 1：检查配置文件
```bash
# 检查配置文件是否存在
ls -la src-tauri/.env

# 查看配置内容
cat src-tauri/.env
```

### 步骤 2：测试 AI 连接
在 AI 面板中发送简单的测试消息：
```
输入：你好
预期：AI 回复问候语
```

### 步骤 3：检查应用日志
1. 打开开发者工具（F12）
2. 查看 Console 标签页
3. 寻找相关错误信息

### 步骤 4：验证 API 密钥
```bash
# 测试 OpenAI API
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://api.openai.com/v1/models

# 测试阿里云 API
curl -H "Authorization: Bearer YOUR_API_KEY" \
     https://dashscope.aliyuncs.com/compatible-mode/v1/models
```

## 🛠️ 配置验证

### 验证脚本
创建一个简单的测试脚本来验证配置：

```javascript
// test-ai-config.js
const { invoke } = require('@tauri-apps/api/tauri');

async function testAIConfig() {
  try {
    const config = await invoke('ai_get_config');
    console.log('✅ AI 配置已加载:', config);
    
    const testResponse = await invoke('ai_chat', {
      request: {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: '你好' }],
        temperature: 0.1,
        max_tokens: 10,
        stream: false
      }
    });
    
    console.log('✅ AI 连接测试成功:', testResponse);
  } catch (error) {
    console.error('❌ 测试失败:', error);
  }
}

testAIConfig();
```

## 📋 配置检查清单

在寻求帮助前，请确认以下项目：

### 基础配置
- [ ] `.env` 文件存在于 `src-tauri/` 目录
- [ ] 配置文件格式正确（无多余空格或特殊字符）
- [ ] API 密钥已正确填入
- [ ] 应用已重启

### 网络环境
- [ ] 网络连接正常
- [ ] 防火墙未阻止应用
- [ ] 代理设置正确（如需要）

### 服务状态
- [ ] AI 服务提供商正常运行
- [ ] API 密钥有效且未过期
- [ ] 账户余额充足（付费服务）

### 应用状态
- [ ] 应用版本最新
- [ ] 无其他错误提示
- [ ] 开发者工具中无相关错误

## 🆘 获取帮助

如果以上步骤都无法解决问题：

### 1. 收集信息
- 操作系统和版本
- GoPilot 版本
- 使用的 AI 服务提供商
- 完整的错误信息
- 配置文件内容（隐去 API 密钥）

### 2. 查看日志
```bash
# 查看应用日志
tail -f ~/.gopilot/logs/app.log

# 查看 Tauri 日志
npm run tauri:dev -- --log-level debug
```

### 3. 社区支持
- GitHub Issues: 报告 bug 和功能请求
- 文档: 查看最新配置指南
- 示例配置: 参考其他用户的配置

## 🎯 预防措施

### 定期维护
- 定期检查 API 密钥有效期
- 监控 API 使用量和费用
- 备份重要配置文件

### 最佳实践
- 使用环境变量管理敏感信息
- 定期更新应用版本
- 关注 AI 服务提供商的变更通知

---

**记住**：大多数 AI 连接问题都是配置不当导致的。仔细检查配置文件通常能解决 90% 的问题！ 🚀
