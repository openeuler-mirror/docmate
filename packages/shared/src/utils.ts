import { DocMateError, MessageType, UICommand, HostResult, ErrorCode, ERROR_MESSAGES } from './types';

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
 * 创建标准化错误对象（使用 ErrorCode 枚举）
 */
export function createStandardError(code: ErrorCode, message?: string, details?: any): DocMateError {
  return {
    code,
    message: message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR],
    details,
    timestamp: Date.now(),
  };
}

/**
 * 安全的错误处理包装器
 */
export async function safeExecute<T>(
  operation: () => Promise<T>,
  context: string,
  fallbackCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    // 创建标准化错误，添加上下文信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    const docMateError = createStandardError(fallbackCode, errorMessage, {
      context,
      originalError: errorMessage,
      errorName: error instanceof Error ? error.name : ''
    });
    throw docMateError;
  }
}

/**
 * 同步版本的安全执行包装器
 */
export function safeExecuteSync<T>(
  operation: () => T,
  context: string,
  fallbackCode: ErrorCode = ErrorCode.UNKNOWN_ERROR
): T {
  try {
    return operation();
  } catch (error) {
    // 创建标准化错误，添加上下文信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    const docMateError = createStandardError(fallbackCode, errorMessage, {
      context,
      originalError: errorMessage,
      errorName: error instanceof Error ? error.name : ''
    });
    throw docMateError;
  }
}

/**
 * 类型守卫：检查是否为UI命令
 */
export function isUICommand(message: MessageType): message is UICommand {
  return ['check', 'polish', 'translate', 'rewrite', 'applySuggestion', 'clearDiagnostics', 'refresh', 'settings', 'auth', 'config', 'cancel', 'checkRule'].includes(message.command);
}

/**
 * 类型守卫：检查是否为DocMateError
 */
export function isDocMateError(error: any): error is DocMateError {
  return error && typeof error === 'object' && 'code' in error && 'message' in error && 'timestamp' in error;
}

/**
 * 类型守卫：检查是否为Host结果
 */
export function isHostResult(message: MessageType): message is HostResult {
  return ['renderResult', 'error', 'loading', 'ready'].includes(message.command);
}
