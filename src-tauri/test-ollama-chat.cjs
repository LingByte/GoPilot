#!/usr/bin/env node

/**
 * 测试 Ollama Chat API（与应用使用相同的端点）
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 测试 Ollama Chat API...\n');

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

// 测试 Ollama Chat API
if (configs.AI_PROVIDER === 'Ollama') {
    console.log('\n🔍 测试 Ollama Chat API...');
    
    const http = require('http');
    
    // 使用与应用相同的请求格式
    const chatRequest = {
        model: configs.AI_MODEL,
        messages: [
            {
                role: "user",
                content: "你好"
            }
        ],
        stream: false,
        options: {
            temperature: 0.7,
            num_predict: 1000
        }
    };
    
    const testData = JSON.stringify(chatRequest);
    
    const options = {
        hostname: 'localhost',
        port: 11434,
        path: '/api/chat',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(testData)
        }
    };
    
    const req = http.request(options, (res) => {
        console.log('✅ Ollama Chat API 响应状态:', res.statusCode);
        
        if (res.statusCode === 200) {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    console.log('✅ Ollama Chat API 响应成功');
                    console.log('📝 AI 回复:', response.message?.content || '无内容');
                    console.log('\n🎉 Chat API 测试通过！');
                } catch (e) {
                    console.log('❌ 响应解析失败:', e.message);
                    console.log('原始响应:', data);
                }
            });
        } else {
            console.log('❌ Ollama Chat API 响应错误:', res.statusCode);
            console.log('错误内容:', data);
        }
    });
    
    req.on('error', (e) => {
        console.log('❌ Ollama Chat API 连接失败:', e.message);
        console.log('\n💡 可能的问题:');
        console.log('1. Ollama 服务未运行: ollama serve');
        console.log('2. 模型未下载: ollama list');
        console.log('3. 端口 11434 被占用');
    });
    
    req.write(testData);
    req.end();
}
