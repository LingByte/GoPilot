const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

// Extension Host 进程
class ExtensionHost extends EventEmitter {
  constructor() {
    super();
    this.extensions = new Map();
    this.vscodeApi = this.createVscodeApi();
    this.setupProcessCommunication();
  }

  setupProcessCommunication() {
    // 监听来自主进程的消息
    process.on('message', (message) => {
      this.handleMessage(message);
    });

    // 通知主进程已准备就绪
    this.send({ type: 'ready' });
  }

  send(message) {
    if (process.send) {
      process.send(message);
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'activate':
        this.activateExtension(message.data);
        break;
      case 'deactivate':
        this.deactivateExtension(message.data);
        break;
      case 'executeCommand':
        this.executeCommand(message.data);
        break;
      default:
        console.warn('[ExtensionHost] Unknown message type:', message.type);
    }
  }

  createVscodeApi() {
    const host = this;
    
    return {
      // Window API
      window: {
        createOutputChannel: (name) => {
          const channel = {
            name,
            append: (text) => {
              host.send({
                type: 'output',
                data: { channel: name, text }
              });
            },
            appendLine: (text) => {
              host.send({
                type: 'output',
                data: { channel: name, text: text + '\n' }
              });
            },
            clear: () => {
              host.send({
                type: 'outputClear',
                data: { channel: name }
              });
            },
            show: () => {},
            hide: () => {},
            dispose: () => {}
          };
          return channel;
        },
        showInformationMessage: (message, ...items) => {
          host.send({
            type: 'message',
            data: { level: 'info', message, items }
          });
          return Promise.resolve(items[0]);
        },
        showErrorMessage: (message, ...items) => {
          host.send({
            type: 'message',
            data: { level: 'error', message, items }
          });
          return Promise.resolve(items[0]);
        },
        showWarningMessage: (message, ...items) => {
          host.send({
            type: 'message',
            data: { level: 'warning', message, items }
          });
          return Promise.resolve(items[0]);
        }
      },

      // Commands API
      commands: {
        registerCommand: (command, callback) => {
          host.send({
            type: 'commandRegistered',
            data: { command }
          });
          
          // 存储命令回调
          if (!host._commands) host._commands = new Map();
          host._commands.set(command, callback);
          
          return {
            dispose: () => {
              host._commands.delete(command);
              host.send({
                type: 'commandUnregistered',
                data: { command }
              });
            }
          };
        },
        executeCommand: (command, ...args) => {
          if (host._commands && host._commands.has(command)) {
            const callback = host._commands.get(command);
            return Promise.resolve(callback(...args));
          }
          return Promise.reject(new Error(`Command ${command} not found`));
        }
      },

      // Workspace API
      workspace: {
        getConfiguration: (section) => {
          return {
            get: (key, defaultValue) => defaultValue,
            update: () => Promise.resolve(),
            inspect: () => undefined
          };
        },
        workspaceFolders: [],
        rootPath: undefined,
        name: undefined
      },

      // Extensions API
      extensions: {
        all: [],
        getExtension: () => undefined,
        getExtensionId: () => ''
      },

      // Env API
      env: {
        appName: 'GoPilot',
        appRoot: process.cwd(),
        language: 'en',
        clipboard: {
          writeText: (text) => {
            host.send({
              type: 'clipboard',
              data: { action: 'write', text }
            });
            return Promise.resolve();
          },
          readText: () => {
            return Promise.reject(new Error('Clipboard read not implemented'));
          }
        }
      },

      // Uri API
      Uri: {
        file: (path) => ({ fsPath: path, scheme: 'file' }),
        parse: (uri) => ({ fsPath: uri, scheme: 'file' })
      },

      // Progress API
      ProgressLocation: {
        Notification: 10,
        Window: 15
      },

      // ViewColumn API
      ViewColumn: {
        One: 1,
        Two: 2,
        Three: 3
      },

      // Disposable
      Disposable: class {
        constructor(call) {
          this._call = call;
        }
        dispose() {
          if (this._call) this._call();
        }
      }
    };
  }

  async activateExtension(data) {
    const { extensionId, extensionPath, entryPoint } = data;
    
    try {
      // 清除之前的模块缓存
      delete require.cache[require.resolve(entryPoint)];
      
      // 创建扩展上下文
      const context = {
        subscriptions: [],
        extensionPath,
        globalState: {
          get: (key, defaultValue) => defaultValue,
          update: (key, value) => Promise.resolve(),
          keys: () => []
        },
        workspaceState: {
          get: (key, defaultValue) => defaultValue,
          update: (key, value) => Promise.resolve(),
          keys: () => []
        },
        secrets: {
          get: (key) => Promise.resolve(undefined),
          store: (key, value) => Promise.resolve(),
          delete: (key) => Promise.resolve()
        }
      };

      // 注入 vscode API
      global.vscode = this.vscodeApi;

      // 加载扩展
      const extensionModule = require(entryPoint);
      
      if (extensionModule.activate && typeof extensionModule.activate === 'function') {
        await extensionModule.activate(context);
        
        this.extensions.set(extensionId, {
          module: extensionModule,
          context,
          active: true
        });

        this.send({
          type: 'activated',
          data: { extensionId }
        });
      } else {
        throw new Error('Extension does not export an activate function');
      }
    } catch (error) {
      console.error(`[ExtensionHost] Failed to activate ${extensionId}:`, error);
      this.send({
        type: 'error',
        data: { extensionId, error: error.message, stack: error.stack }
      });
    }
  }

  async deactivateExtension(data) {
    const { extensionId } = data;
    const extension = this.extensions.get(extensionId);
    
    if (extension && extension.module.deactivate) {
      try {
        await extension.module.deactivate();
      } catch (error) {
        console.error(`[ExtensionHost] Failed to deactivate ${extensionId}:`, error);
      }
    }
    
    this.extensions.delete(extensionId);
    this.send({
      type: 'deactivated',
      data: { extensionId }
    });
  }

  async executeCommand(data) {
    const { command, args } = data;
    
    if (this._commands && this._commands.has(command)) {
      try {
        const callback = this._commands.get(command);
        const result = await callback(...args);
        this.send({
          type: 'commandResult',
          data: { command, result, success: true }
        });
      } catch (error) {
        this.send({
          type: 'commandResult',
          data: { command, error: error.message, success: false }
        });
      }
    } else {
      this.send({
        type: 'commandResult',
        data: { command, error: `Command ${command} not found`, success: false }
      });
    }
  }
}

// 启动 Extension Host
const host = new ExtensionHost();

// 优雅关闭
process.on('SIGINT', () => {
  console.log('[ExtensionHost] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[ExtensionHost] Shutting down...');
  process.exit(0);
});
