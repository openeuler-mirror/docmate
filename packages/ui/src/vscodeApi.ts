import { UICommand, HostResult } from '@docmate/shared';

// VS Code API类型定义
interface VSCodeApi {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeApi;
  }
}

class VSCodeApiWrapper {
  private vscodeApi: VSCodeApi;
  private messageListeners: Array<(message: HostResult) => void> = [];

  constructor() {
    this.vscodeApi = window.acquireVsCodeApi();
    this.setupMessageListener();
  }

  /**
   * 设置消息监听器
   */
  private setupMessageListener(): void {
    window.addEventListener('message', (event) => {
      const message = event.data as HostResult;
      this.messageListeners.forEach(listener => {
        try {
          listener(message);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      });
    });
  }

  /**
   * 发送命令到扩展
   */
  postMessage(command: UICommand): void {
    this.vscodeApi.postMessage(command);
  }

  /**
   * 添加消息监听器
   */
  onMessage(listener: (message: HostResult) => void): () => void {
    this.messageListeners.push(listener);

    // 返回取消监听的函数
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index > -1) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  /**
   * 获取状态
   */
  getState<T = any>(): T | undefined {
    return this.vscodeApi.getState();
  }

  /**
   * 设置状态
   */
  setState<T = any>(state: T): void {
    this.vscodeApi.setState(state);
  }

  /**
   * 发送检查命令
   */
  check(text: string, options?: any): void {
    this.postMessage({
      command: 'check',
      payload: { text, options }
    });
  }

  /**
   * 发送润色命令
   */
  polish(text: string, options?: any): void {
    this.postMessage({
      command: 'polish',
      payload: { text, options }
    });
  }

  /**
   * 发送翻译命令
   */
  translate(text: string, options?: any): void {
    this.postMessage({
      command: 'translate',
      payload: { text, options }
    });
  }

  /**
   * 发送刷新命令
   */
  refresh(): void {
    this.postMessage({
      command: 'refresh',
      payload: {}
    });
  }

  /**
   * 发送设置命令
   */
  settings(action: string, data?: any): void {
    this.postMessage({
      command: 'settings',
      payload: {
        text: '',
        options: { action, data }
      }
    });
  }
}

// 创建单例实例
export const vscodeApi = new VSCodeApiWrapper();
