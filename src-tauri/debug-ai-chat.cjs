#!/usr/bin/env node

/**
 * 调试 AI 聊天请求格式
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 调试 AI 聊天请求格式...\n');

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

// 模拟应用中的请求格式
const chatRequest = {
    model: configs.AI_MODEL,
    messages: [
        { 
            role: "system", 
            content: "你是一个专业的编程助手，帮助用户解决编程问题。请用中文回答。" 
        },
        { 
            role: "user", 
            content: "你好" 
        }
    ],
    temperature: 0.7,
    max_tokens: 1000,
    stream: false
};

console.log('📋 应用中的请求格式:');
console.log(JSON.stringify(chatRequest, null, 2));

// 转换为 Ollama 格式（与应用中的逻辑相同）
const ollamaRequest = {
    model: chatRequest.model,
    messages: chatRequest.messages,
    stream: false,
    options: {
        temperature: chatRequest.temperature,
        num_predict: chatRequest.max_tokens
    }
};

console.log('\n🔄 转换后的 Ollama 请求格式:');
console.log(JSON.stringify(ollamaRequest, null, 2));

// 测试这个请求
const http = require('http');
const testData = JSON.stringify(ollamaRequest);

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

console.log('\n🧪 测试完整请求...');

const req = http.request(options, (res) => {
    console.log('响应状态:', res.statusCode);
    
    let data = '';
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        try {
            const response = JSON.parse(data);
            console.log('✅ 请求成功');
            console.log('AI 回复:', response.message?.content);
            
            // 模拟应用中的响应转换
            const chatResponse = {
                id: "test-id",
                object: "chat.completion",
                created: Date.now() / 1000,
                model: chatRequest.model,
                choices: [{
                    index: 0,
                    message: {
                        role: "assistant",
                        content: response.message?.content || ""
                    },
                    finish_reason: "stop"
                }]
            };
            
            console.log('\n📋 转换后的应用响应格式:');
            console.log(JSON.stringify(chatResponse, null, 2));
            
        } catch (e) {
            console.log('❌ 解析失败:', e.message);
            console.log('原始响应:', data);
        }
    });
});

req.on('error', (e) => {
    console.log('❌ 请求失败:', e.message);
});

req.write(testData);
req.end();
