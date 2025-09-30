import * as vscode from 'vscode';
import * as crypto from 'crypto';

/**
 * 管理已处理（dismissed）状态的持久化服务
 * 使用 workspaceState 存储项目级别的状态
 */
export class DismissedStateService {
  private static readonly DISMISSED_KEY_PREFIX = 'docmate.dismissed';
  private static readonly CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7天
  
  constructor(private context: vscode.ExtensionContext) {}

  /**
   * 生成唯一键
   */
  private generateKey(originalText: string, fileUri?: string): string {
    const content = originalText + (fileUri || '');
    const hash = crypto.createHash('md5').update(content).digest('hex');
    return `${DismissedStateService.DISMISSED_KEY_PREFIX}.${hash.substring(0, 16)}`;
  }

  /**
   * 标记为已处理
   */
  async markDismissed(originalText: string, fileUri?: string): Promise<void> {
    const key = this.generateKey(originalText, fileUri);
    const timestamp = Date.now();
    
    await this.context.workspaceState.update(key, {
      timestamp,
      originalText: originalText.substring(0, 100), // 存储前100字符用于调试
      fileUri
    });
    
    console.log(`DismissedStateService: Marked as dismissed - ${key}`);
  }

  /**
   * 检查是否已处理
   */
  isDismissed(originalText: string, fileUri?: string): boolean {
    const key = this.generateKey(originalText, fileUri);
    const state = this.context.workspaceState.get(key);
    
    if (state) {
      console.log(`DismissedStateService: Found dismissed state - ${key}`);
      return true;
    }
    
    return false;
  }

  /**
   * 获取所有已处理的键集合
   */
  getAllDismissedKeys(): string[] {
    const keys = this.context.workspaceState.keys();
    return keys.filter(key => key.startsWith(DismissedStateService.DISMISSED_KEY_PREFIX));
  }

  /**
   * 清理过期的状态
   */
  async cleanupExpiredStates(): Promise<void> {
    const keys = this.getAllDismissedKeys();
    const now = Date.now();
    let cleanedCount = 0;

    for (const key of keys) {
      const state = this.context.workspaceState.get(key) as any;
      if (state && state.timestamp) {
        if (now - state.timestamp > DismissedStateService.CLEANUP_INTERVAL) {
          await this.context.workspaceState.update(key, undefined);
          cleanedCount++;
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`DismissedStateService: Cleaned up ${cleanedCount} expired states`);
    }
  }

  /**
   * 获取已处理状态的统计信息
   */
  getStats(): { total: number; keys: string[] } {
    const keys = this.getAllDismissedKeys();
    return {
      total: keys.length,
      keys: keys.map(key => key.replace(DismissedStateService.DISMISSED_KEY_PREFIX + '.', ''))
    };
  }

  /**
   * 清除所有已处理状态（用于测试或重置）
   */
  async clearAll(): Promise<void> {
    const keys = this.getAllDismissedKeys();
    for (const key of keys) {
      await this.context.workspaceState.update(key, undefined);
    }
    console.log(`DismissedStateService: Cleared ${keys.length} dismissed states`);
  }

}
