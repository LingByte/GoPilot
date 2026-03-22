#!/usr/bin/env node

/**
 * 测试 AI 连接是否正常
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 测试 AI 连接...\n');

// 读取配置
const envPath = path.join(__dirname, '.env');
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

console.log('📋 配置信息:');
console.log('  Provider:', configs.AI_PROVIDER);
console.log('  Base URL:', configs.AI_BASE_URL);
console.log('  Model:', configs.AI_MODEL);
console.log('  API Key:', configs.AI_API_KEY ? '已设置' : '未设置');

// 测试 Ollama 连接
if (configs.AI_PROVIDER === 'Ollama') {
    console.log('\n🔍 测试 Ollama 连接...');
    
    const http = require('http');
    
    const testData = JSON.stringify({
        model: configs.AI_MODEL,
        prompt: 'Hello',
        stream: false
    });
    
    const options = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/generate',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(testData)
        }
    };
    
    const req = http.request(options, (res) => {
        console.log('✅ Ollama 服务响应状态:', res.statusCode);
        
        if (res.statusCode === 200) {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('✅ Ollama 响应成功');
                    console.log('📝 测试响应:', response.response?.substring(0, 100) + '...');
                    console.log('\n🎉 AI 连接测试通过！');
                } catch (e) {
                    console.log('❌ 响应解析失败:', e.message);
                }
            });
        } else {
            console.log('❌ Ollama 响应错误:', res.statusCode);
        }
    });
    
    req.on('error', (e) => {
        console.log('❌ Ollama 连接失败:', e.message);
        console.log('\n💡 解决方案:');
        console.log('1. 确保 Ollama 正在运行: ollama serve');
        console.log('2. 检查端口 11434 是否可用');
        console.log('3. 确认模型已下载: ollama list');
    });
    
    req.write(testData);
    req.end();
}
