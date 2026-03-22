#!/usr/bin/env node

/**
 * 测试 AI 配置是否正确加载
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

console.log('🔍 检查 AI 配置...\n');

// 检查配置文件是否存在
if (!fs.existsSync(envPath)) {
    console.log('❌ .env 文件不存在');
    console.log('📍 期望位置:', envPath);
    process.exit(1);
}

console.log('✅ .env 文件存在');

// 读取配置文件
const envContent = fs.readFileSync(envPath, 'utf8');
console.log('📄 配置文件内容:');
console.log('---');
console.log(envContent);
console.log('---\n');

// 检查必需的配置项
const requiredConfigs = [
    'AI_PROVIDER',
    'AI_BASE_URL', 
    'AI_API_KEY',
    'AI_MODEL'
];

const configs = {};
const lines = envContent.split('\n');

lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            configs[key.trim()] = valueParts.join('=').trim();
        }
    }
});

console.log('🔧 解析的配置:');
Object.entries(configs).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
});
console.log('');

// 检查必需配置
let allConfigured = true;
requiredConfigs.forEach(key => {
    if (!configs[key]) {
        console.log(`❌ 缺少配置: ${key}`);
        allConfigured = false;
    } else {
        console.log(`✅ ${key}: ${configs[key]}`);
    }
});

if (!allConfigured) {
    console.log('\n❌ 配置不完整');
    process.exit(1);
}

// 特定检查
console.log('\n🔍 详细检查:');

if (configs.AI_PROVIDER === 'Ollama') {
    console.log('✅ 使用 Ollama 配置');
    
    if (configs.AI_BASE_URL === 'http://localhost:11434') {
        console.log('✅ Ollama URL 正确');
    } else {
        console.log('⚠️  Ollama URL 可能不正确');
    }
    
    if (configs.AI_API_KEY === 'ollama') {
        console.log('✅ Ollama API Key 正确');
    } else {
        console.log('⚠️  Ollama API Key 应该是 "ollama"');
    }
    
    console.log('📋 模型:', configs.AI_MODEL);
    console.log('💡 提示: 确保已下载模型: ollama pull', configs.AI_MODEL);
}

console.log('\n🎉 配置检查完成!');
console.log('\n📋 下一步:');
console.log('1. 确保 Ollama 服务正在运行: ollama serve');
console.log('2. 下载模型: ollama pull', configs.AI_MODEL);
console.log('3. 重启 GoPilot 应用: npm run tauri:dev');
console.log('4. 在 AI 面板中点击设置图标重新检查配置');
