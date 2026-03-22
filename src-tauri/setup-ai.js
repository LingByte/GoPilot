#!/usr/bin/env node

/**
 * GoPilot AI 配置助手
 * 快速设置 AI 服务配置
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

// AI 服务提供商配置
const providers = {
  dashscope: {
    name: '阿里云通义千问 (推荐)',
    description: '免费额度充足，中文支持优秀',
    config: {
      AI_PROVIDER: 'OpenAI',
      AI_BASE_URL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      AI_MODEL: 'qwen-turbo'
    }
  },
  openai: {
    name: 'OpenAI GPT',
    description: '原版 GPT 模型，质量优秀',
    config: {
      AI_PROVIDER: 'OpenAI',
      AI_BASE_URL: 'https://api.openai.com/v1',
      AI_MODEL: 'gpt-3.5-turbo'
    }
  },
  ollama: {
    name: '本地 Ollama',
    description: '完全免费，需要本地运行',
    config: {
      AI_PROVIDER: 'Ollama',
      AI_BASE_URL: 'http://localhost:11434',
      AI_MODEL: 'llama2'
    }
  }
};

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

function createEnvFile(config) {
  let envContent = '# GoPilot AI 配置文件\n';
  envContent += '# 由配置助手自动生成\n\n';
  
  // AI 配置
  envContent += '# AI 配置\n';
  Object.entries(config).forEach(([key, value]) => {
    envContent += `${key}=${value}\n`;
  });
  
  // 默认配置
  envContent += '\n# 数据库配置\n';
  envContent += 'DB_DEFAULT_TYPE=sqlite\n';
  envContent += 'DB_CONNECTION_TIMEOUT=30\n';
  envContent += 'DB_QUERY_TIMEOUT=60\n\n';
  
  envContent += '# 应用设置\n';
  envContent += 'APP_NAME=GoPilot\n';
  envContent += 'APP_VERSION=1.0.0\n';
  envContent += 'APP_DEBUG=true\n';
  envContent += 'APP_LOG_LEVEL=info\n';
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ 配置文件已创建:', envPath);
}

async function main() {
  console.log('🤖 GoPilot AI 配置助手');
  console.log('====================\n');
  
  // 检查是否已存在配置
  if (fs.existsSync(envPath)) {
    console.log('⚠️  检测到已存在的 .env 文件');
    const overwrite = await question('是否要覆盖现有配置? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('❌ 配置已取消');
      rl.close();
      return;
    }
  }
  
  // 选择 AI 服务提供商
  console.log('请选择 AI 服务提供商:\n');
  Object.entries(providers).forEach(([key, provider], index) => {
    console.log(`${index + 1}. ${provider.name}`);
    console.log(`   ${provider.description}\n`);
  });
  
  const choice = await question('请输入选择 (1-3): ');
  const providerKeys = Object.keys(providers);
  const selectedKey = providerKeys[parseInt(choice) - 1];
  
  if (!selectedKey) {
    console.log('❌ 无效的选择');
    rl.close();
    return;
  }
  
  const selectedProvider = providers[selectedKey];
  console.log(`\n✅ 已选择: ${selectedProvider.name}\n`);
  
  // 获取 API 密钥（Ollama 不需要）
  let apiKey = 'ollama';
  if (selectedKey !== 'ollama') {
    console.log('📝 请获取 API 密钥:');
    if (selectedKey === 'dashscope') {
      console.log('   1. 访问 https://bailian.console.aliyun.com/');
      console.log('   2. 注册并登录');
      console.log('   3. 在 API-KEY 管理中创建新的 API 密钥\n');
    } else if (selectedKey === 'openai') {
      console.log('   1. 访问 https://platform.openai.com/');
      console.log('   2. 注册并登录');
      console.log('   3. 在 API Keys 页面创建新的密钥\n');
    }
    
    apiKey = await question('请输入 API 密钥: ');
    if (!apiKey.trim()) {
      console.log('❌ API 密钥不能为空');
      rl.close();
      return;
    }
  }
  
  // 创建配置
  const config = {
    ...selectedProvider.config,
    AI_API_KEY: apiKey.trim()
  };
  
  createEnvFile(config);
  
  console.log('\n🎉 配置完成!');
  console.log('\n📋 下一步操作:');
  console.log('1. 重启 GoPilot 应用');
  console.log('2. 打开 AI 面板测试连接');
  console.log('3. 开始使用 AI 编程助手\n');
  
  if (selectedKey === 'ollama') {
    console.log('🦙 Ollama 使用说明:');
    console.log('1. 确保已安装 Ollama: https://ollama.ai/');
    console.log('2. 启动 Ollama 服务: ollama serve');
    console.log('3. 下载模型: ollama pull llama2');
    console.log('4. 确保 Ollama 在后台运行\n');
  }
  
  console.log('📖 更多帮助请查看 docs/ai-configuration-guide.md');
  
  rl.close();
}

main().catch(console.error);
