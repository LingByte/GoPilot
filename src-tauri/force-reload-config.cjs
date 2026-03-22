#!/usr/bin/env node

/**
 * 强制重新加载 AI 配置
 */

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');

console.log('🔄 强制重新加载配置...\n');

// 检查配置文件
if (!fs.existsSync(envPath)) {
    console.log('❌ .env 文件不存在');
    process.exit(1);
}

// 读取配置
const envContent = fs.readFileSync(envPath, 'utf8');
const configs = {};

envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
            configs[key.trim()] = valueParts.join('=').trim();
        }
    }
});

// 验证关键配置
const required = ['AI_PROVIDER', 'AI_BASE_URL', 'AI_API_KEY', 'AI_MODEL'];
const missing = required.filter(key => !configs[key]);

if (missing.length > 0) {
    console.log('❌ 缺少配置:', missing.join(', '));
    process.exit(1);
}

console.log('✅ 配置验证通过');
console.log('📋 当前配置:');
Object.entries(configs).forEach(([key, value]) => {
    if (key.startsWith('AI_')) {
        console.log(`  ${key}: ${value}`);
    }
});

// 创建配置备份
const backupPath = path.join(__dirname, '.env.backup');
fs.copyFileSync(envPath, backupPath);
console.log('✅ 配置已备份到:', backupPath);

// 重新写入配置（强制刷新）
const timestamp = new Date().toISOString();
const newContent = envContent + `\n# 配置刷新时间: ${timestamp}\n`;
fs.writeFileSync(envPath, newContent);

console.log('✅ 配置已刷新');
console.log('\n📋 下一步:');
console.log('1. 重启 GoPilot 应用: npm run tauri:dev');
console.log('2. 在 AI 面板中点击设置图标');
console.log('3. 测试 AI 连接');
