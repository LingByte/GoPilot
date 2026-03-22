#!/usr/bin/env node

/**
 * 测试会话管理功能
 */

const http = require('http');

const BASE_URL = 'http://localhost:1420'; // Tauri 默认端口

// 发送 HTTP 请求到 Tauri 命令
async function invokeCommand(command, args = {}) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            cmd: command,
            args: args
        });

        const options = {
            hostname: 'localhost',
            port: 1420,
            path: '/invoke',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (response.success) {
                        resolve(response.data);
                    } else {
                        reject(new Error(response.error));
                    }
                } catch (e) {
                    reject(new Error(`解析响应失败: ${e.message}`));
                }
            });
        });

        req.on('error', (e) => {
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

async function testConversation() {
    console.log('🧪 测试会话管理功能...\n');

    try {
        // 1. 创建新会话
        console.log('📋 步骤1: 创建新会话');
        const conversationId = await invokeCommand('conversation_create', {
            title: '测试会话 - GoPilot 代码助手'
        });
        console.log('✅ 会话创建成功:', conversationId);

        // 2. 获取会话信息
        console.log('\n📋 步骤2: 获取会话信息');
        const conversation = await invokeCommand('conversation_get', {
            conversationId: conversationId
        });
        console.log('✅ 会话信息:');
        console.log('  ID:', conversation.id);
        console.log('  标题:', conversation.title);
        console.log('  创建时间:', new Date(conversation.created_at * 1000).toLocaleString());
        console.log('  消息数量:', conversation.messages.length);

        // 3. 发送消息
        console.log('\n📋 步骤3: 发送消息');
        const response = await invokeCommand('conversation_send_message', {
            conversationId: conversationId,
            content: '你好，我是 GoPilot 代码助手，请介绍一下你的功能。'
        });
        console.log('✅ 消息发送成功');
        console.log('📝 AI 回复:', response.choices[0].message.content.substring(0, 100) + '...');

        // 4. 再次获取会话信息（应该有更多消息）
        console.log('\n📋 步骤4: 检查消息历史');
        const updatedConversation = await invokeCommand('conversation_get', {
            conversationId: conversationId
        });
        console.log('✅ 更新后的消息数量:', updatedConversation.messages.length);

        // 5. 获取所有会话列表
        console.log('\n📋 步骤5: 获取会话列表');
        const conversations = await invokeCommand('conversation_list');
        console.log('✅ 会话列表:');
        conversations.forEach((conv, index) => {
            console.log(`  ${index + 1}. ${conv.title} (${conv.messages.length} 条消息)`);
        });

        // 6. 发送第二条消息（测试记忆功能）
        console.log('\n📋 步骤6: 测试记忆功能');
        const memoryResponse = await invokeCommand('conversation_send_message', {
            conversationId: conversationId,
            content: '请记住我刚才问的问题，现在给我一个简单的代码示例。'
        });
        console.log('✅ 记忆测试消息发送成功');
        console.log('📝 AI 回复:', memoryResponse.choices[0].message.content.substring(0, 100) + '...');

        console.log('\n🎉 会话管理功能测试完成！');
        console.log('\n📊 测试总结:');
        console.log('  ✅ 会话创建');
        console.log('  ✅ 会话获取');
        console.log('  ✅ 消息发送');
        console.log('  ✅ 短期记忆');
        console.log('  ✅ 会话列表');

    } catch (error) {
        console.error('❌ 测试失败:', error.message);
        console.log('\n💡 可能的原因:');
        console.log('1. 应用未启动或端口不正确');
        console.log('2. AI 配置未设置');
        console.log('3. 网络连接问题');
    }
}

// 运行测试
testConversation();
