import { DocMateError, MessageType, UICommand, HostResult } from './types';

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 创建错误对象
 */
export function createError(code: string, message: string, details?: any): DocMateError {
  return {
    code,
    message,
    details,
    timestamp: Date.now(),
  };
}

/**
 * 类型守卫：检查是否为UI命令
 */
export function isUICommand(message: MessageType): message is UICommand {
  return ['check', 'polish', 'translate', 'rewrite', 'applySuggestion', 'refresh', 'settings', 'auth', 'config'].includes(message.command);
}

/**
 * 类型守卫：检查是否为Host结果
 */
export function isHostResult(message: MessageType): message is HostResult {
  return ['renderResult', 'error', 'loading', 'ready'].includes(message.command);
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

/**
 * 延迟函数
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 安全的JSON解析
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * 安全的JSON字符串化
 */
export function safeJsonStringify(obj: any): string {
  try {
    return JSON.stringify(obj);
  } catch {
    return '{}';
  }
}

/**
 * 截断文本
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * 验证文本范围
 */
export function isValidRange(text: string, start: number, end: number): boolean {
  return start >= 0 && end <= text.length && start <= end;
}

/**
 * 提取文本范围
 */
export function extractTextRange(text: string, start: number, end: number): string {
  if (!isValidRange(text, start, end)) {
    return '';
  }
  return text.substring(start, end);
}
