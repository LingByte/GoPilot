import { EventEmitter } from 'events';
import * as path from 'path';
import * as fs from 'fs';

interface ExtensionContext {
  subscriptions: any[];
  extensionPath: string;
  globalState: {
    get(key: string, defaultValue?: any): any;
    update(key: string, value: any): Promise<void>;
    keys(): string[];
  };
  workspaceState: {
    get(key: string, defaultValue?: any): any;
    update(key: string, value: any): Promise<void>;
    keys(): string[];
  };
  secrets: {
    get(key: string): Promise<string | undefined>;
    store(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

interface ExtensionData {
  extensionId: string;
  extensionPath: string;
  entryPoint: string;
}

interface HostMessage {
  type: string;
  data?: any;
}

// Extension Host 进程
class ExtensionHost extends EventEmitter {
  private extensions = new Map<string, any>();
  private vscodeApi: any;
  private _commands = new Map<string, Function>();

  constructor() {
    super();
    this.vscodeApi = this.createVscodeApi();
    this.setupProcessCommunication();
  }

  private setupProcessCommunication() {
    // 监听来自主进程的消息
    process.on('message', (message: HostMessage) => {
      this.handleMessage(message);
    });

    // 通知主进程已准备就绪
    this.send({ type: 'ready' });
  }

  private send(message: HostMessage) {
    if (process.send) {
      process.send(message);
    }
  }

  private handleMessage(message: HostMessage) {
    switch (message.type) {
      case 'activate':
        this.activateExtension(message.data as ExtensionData);
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

  private createVscodeApi() {
    const host = this;
    
    return {
      // Window API
      window: {
        createOutputChannel: (name: string) => {
          const channel = {
            name,
            append: (text: string) => {
              host.send({
                type: 'output',
                data: { channel: name, text }
              });
            },
            appendLine: (text: string) => {
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
        showInformationMessage: (message: string, ...items: string[]) => {
          host.send({
            type: 'message',
            data: { level: 'info', message, items }
          });
          return Promise.resolve(items[0]);
        },
        showErrorMessage: (message: string, ...items: string[]) => {
          host.send({
            type: 'message',
            data: { level: 'error', message, items }
          });
          return Promise.resolve(items[0]);
        },
        showWarningMessage: (message: string, ...items: string[]) => {
          host.send({
            type: 'message',
            data: { level: 'warning', message, items }
          });
          return Promise.resolve(items[0]);
        }
      },

      // Commands API
      commands: {
        registerCommand: (command: string, callback: Function) => {
          host.send({
            type: 'commandRegistered',
            data: { command }
          });
          
          // 存储命令回调
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
        executeCommand: (command: string, ...args: any[]) => {
          if (host._commands.has(command)) {
            const callback = host._commands.get(command);
            if (callback) {
              return Promise.resolve(callback(...args));
            }
          }
          return Promise.reject(new Error(`Command ${command} not found`));
        }
      },

      // Workspace API
      workspace: {
        getConfiguration: (section?: string) => {
          return {
            get: (key: string, defaultValue?: any) => defaultValue,
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
          writeText: (text: string) => {
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
        file: (path: string) => ({ fsPath: path, scheme: 'file' }),
        parse: (uri: string) => ({ fsPath: uri, scheme: 'file' })
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
        private _call?: Function;
        constructor(call?: Function) {
          this._call = call;
        }
        dispose() {
          if (this._call) this._call();
        }
      }
    };
  }

  private async activateExtension(data: ExtensionData) {
    const { extensionId, extensionPath, entryPoint } = data;
    
    try {
      // 清除之前的模块缓存
      delete require.cache[require.resolve(entryPoint)];
      
      // 创建扩展上下文
      const context: ExtensionContext = {
        subscriptions: [],
        extensionPath,
        globalState: {
          get: (key: string, defaultValue?: any) => defaultValue,
          update: (key: string, value: any) => Promise.resolve(),
          keys: () => []
        },
        workspaceState: {
          get: (key: string, defaultValue?: any) => defaultValue,
          update: (key: string, value: any) => Promise.resolve(),
          keys: () => []
        },
        secrets: {
          get: (key: string) => Promise.resolve(undefined),
          store: (key: string, value: string) => Promise.resolve(),
          delete: (key: string) => Promise.resolve()
        }
      };

      // 注入 vscode API
      (global as any).vscode = this.vscodeApi;

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
        data: { 
          extensionId, 
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        }
      });
    }
  }

  private async deactivateExtension(data: { extensionId: string }) {
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

  private async executeCommand(data: { command: string; args: any[] }) {
    const { command, args } = data;
    
    if (this._commands.has(command)) {
      try {
        const callback = this._commands.get(command);
        if (callback) {
          const result = await callback(...args);
          this.send({
            type: 'commandResult',
            data: { command, result, success: true }
          });
        }
      } catch (error) {
        this.send({
          type: 'commandResult',
          data: { 
            command, 
            error: error instanceof Error ? error.message : String(error), 
            success: false 
          }
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

console.log('[ExtensionHost] Started');

export { ExtensionHost };

// 优雅关闭
process.on('SIGINT', () => {
  console.log('[ExtensionHost] Shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[ExtensionHost] Shutting down...');
  process.exit(0);
});
