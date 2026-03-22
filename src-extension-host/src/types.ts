export interface ExtensionContext {
  subscriptions: any[];
  extensionPath: string;
  globalState: ExtensionState;
  workspaceState: ExtensionState;
  secrets: ExtensionSecrets;
}

export interface ExtensionState {
  get(key: string, defaultValue?: any): any;
  update(key: string, value: any): Promise<void>;
  keys(): string[];
}

export interface ExtensionSecrets {
  get(key: string): Promise<string | undefined>;
  store(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface ExtensionData {
  extensionId: string;
  extensionPath: string;
  entryPoint: string;
}

export interface HostMessage {
  type: string;
  data?: any;
}

export interface OutputMessage {
  channel: string;
  text: string;
}

export interface MessageData {
  level: 'info' | 'warning' | 'error';
  message: string;
  items?: string[];
}

export interface CommandData {
  command: string;
  args?: any[];
}

export interface CommandResultData {
  command: string;
  result?: any;
  error?: string;
  success: boolean;
}
