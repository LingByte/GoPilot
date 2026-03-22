import { invoke } from '@tauri-apps/api/tauri';

// 简单的事件发射器实现，用于浏览器环境
class SimpleEventEmitter {
  private events: Map<string, Function[]> = new Map();

  on(event: string, listener: Function) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(listener);
  }

  emit(event: string, ...args: any[]) {
    const listeners = this.events.get(event);
    if (listeners) {
      listeners.forEach(listener => listener(...args));
    }
  }
}

export interface ExtensionHostMessage {
  type: string;
  data?: any;
}

export interface ExtensionData {
  extensionId: string;
  extensionPath: string;
  entryPoint: string;
}

/**
 * Node Extension Host 管理器
 * 负责启动和管理 Node.js Extension Host 进程
 */
export class ExtensionHostManager extends SimpleEventEmitter {
  private isReady = false;
  private isStarting = false;
  private pendingMessages: ExtensionHostMessage[] = [];

  constructor() {
    super();
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners() {
    // 监听来自 Extension Host 的消息
    if (typeof window !== 'undefined') {
      window.addEventListener('extension-host-message', (event) => {
        const message = (event as CustomEvent).detail;
        this.handleHostMessage(message);
      });
    }
  }

  /**
   * 启动 Extension Host 进程
   */
  async start(): Promise<void> {
    if (this.isReady || this.isStarting) {
      console.log('[ExtensionHostManager] Extension Host already starting or ready');
      return;
    }

    this.isStarting = true;
    
    try {
      console.log('[ExtensionHostManager] Starting Extension Host...');
      
      // 通过 Tauri 启动 Extension Host
      await invoke('start_extension_host');
      
      // 暂时直接标记为 ready，等待后续实现完整的 IPC 通信
      this.isReady = true;
      this.isStarting = false;
      this.emit('ready');
      this.flushPendingMessages();
      
      console.log('[ExtensionHostManager] Extension Host started');
    } catch (error) {
      console.error('[ExtensionHostManager] Failed to start Extension Host:', error);
      this.isStarting = false;
      this.emit('error', error);
    }
  }

  /**
   * 停止 Extension Host 进程
   */
  async stop(): Promise<void> {
    try {
      console.log('[ExtensionHostManager] Stopping Extension Host...');
      
      // 通过 Tauri 停止 Extension Host
      await invoke('stop_extension_host');
      
      this.isReady = false;
      this.emit('stopped');
      
      console.log('[ExtensionHostManager] Extension Host stopped');
    } catch (error) {
      console.error('[ExtensionHostManager] Failed to stop Extension Host:', error);
    }
  }

  /**
   * 发送消息到 Extension Host
   */
  private sendMessage(message: ExtensionHostMessage): void {
    if (!this.isReady) {
      this.pendingMessages.push(message);
      return;
    }

    // 通过 Tauri 发送消息到 Extension Host
    this.sendToHost(message);
  }

  /**
   * 通过 Tauri 发送消息
   */
  private async sendToHost(message: ExtensionHostMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'activate':
          await invoke('activate_extension', { extensionData: message.data });
          break;
        case 'deactivate':
          await invoke('deactivate_extension', { extensionId: message.data.extensionId });
          break;
        case 'executeCommand':
          await invoke('extension_host_execute_command', { 
            command: message.data.command, 
            args: message.data.args || [] 
          });
          break;
        default:
          console.warn('[ExtensionHostManager] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[ExtensionHostManager] Failed to send message:', error);
    }
  }

  /**
   * 发送待处理消息
   */
  private flushPendingMessages(): void {
    while (this.pendingMessages.length > 0) {
      const message = this.pendingMessages.shift()!;
      this.sendToHost(message);
    }
  }

  /**
   * 激活扩展
   */
  activateExtension(data: ExtensionData): void {
    this.sendMessage({
      type: 'activate',
      data
    });
  }

  /**
   * 停用扩展
   */
  deactivateExtension(extensionId: string): void {
    this.sendMessage({
      type: 'deactivate',
      data: { extensionId }
    });
  }

  /**
   * 执行命令
   */
  executeCommand(command: string, ...args: any[]): void {
    this.sendMessage({
      type: 'executeCommand',
      data: { command, args }
    });
  }

  /**
   * 处理来自 Extension Host 的消息
   */
  private handleHostMessage(message: ExtensionHostMessage): void {
    switch (message.type) {
      case 'ready':
        this.isReady = true;
        this.emit('ready');
        this.flushPendingMessages();
        break;
      
      case 'activated':
        this.emit('extensionActivated', message.data);
        break;
      
      case 'deactivated':
        this.emit('extensionDeactivated', message.data);
        break;
      
      case 'error':
        this.emit('extensionError', message.data);
        break;
      
      case 'output':
        this.emit('output', message.data);
        break;
      
      case 'message':
        this.emit('message', message.data);
        break;
      
      case 'commandRegistered':
        this.emit('commandRegistered', message.data);
        break;
      
      case 'commandUnregistered':
        this.emit('commandUnregistered', message.data);
        break;
      
      case 'commandResult':
        this.emit('commandResult', message.data);
        break;
      
      default:
        console.warn('[ExtensionHostManager] Unknown message type:', message.type);
    }
  }

  /**
   * 检查是否已准备就绪
   */
  get ready(): boolean {
    return this.isReady;
  }
}

// 全局实例
export const extensionHostManager = new ExtensionHostManager();
