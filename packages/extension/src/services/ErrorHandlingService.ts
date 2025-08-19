import { ErrorCode, ERROR_MESSAGES, DocMateError } from '@docmate/shared';

/**
 * 统一错误处理服务
 * 提供错误码映射、友好消息转换和结构化错误处理
 */
export class ErrorHandlingService {
  
  /**
   * 创建标准化错误对象
   */
  static createError(code: ErrorCode, message?: string, details?: any): DocMateError {
    return {
      code,
      message: message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR],
      details,
      timestamp: Date.now()
    };
  }

  /**
   * 从原始错误转换为友好错误
   */
  static fromError(error: Error | any, fallbackCode: ErrorCode = ErrorCode.UNKNOWN_ERROR): DocMateError {
    // 如果已经是DocMateError，直接返回
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return error as DocMateError;
    }

    // 根据错误类型和消息内容推断错误类型
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lowerMessage = errorMessage.toLowerCase();
    const errorName = error instanceof Error ? error.name : '';

    let code: ErrorCode = fallbackCode;

    // 首先检查错误类型（通过 error.name）
    if (errorName === 'AbortError') {
      code = ErrorCode.CONNECTION_TIMEOUT;
    } else if (errorName === 'TimeoutError') {
      code = ErrorCode.CONNECTION_TIMEOUT;
    } else if (errorName === 'TypeError' && lowerMessage.includes('fetch')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (errorName === 'SyntaxError' && lowerMessage.includes('json')) {
      code = ErrorCode.JSON_PARSE_ERROR;
    }
    // 然后检查错误消息内容
    else if (lowerMessage.includes('network') || lowerMessage.includes('fetch failed')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      code = ErrorCode.CONNECTION_TIMEOUT;
    } else if (lowerMessage.includes('api key') || lowerMessage.includes('unauthorized') || lowerMessage.includes('401')) {
      code = ErrorCode.INVALID_API_KEY;
    } else if (lowerMessage.includes('json') || lowerMessage.includes('parse')) {
      code = ErrorCode.JSON_PARSE_ERROR;
    } else if (lowerMessage.includes('config') && (lowerMessage.includes('missing') || lowerMessage.includes('invalid'))) {
      code = ErrorCode.CONFIG_INVALID;
    } else if (lowerMessage.includes('text') && lowerMessage.includes('not found')) {
      code = ErrorCode.ORIGINAL_TEXT_NOT_FOUND;
    } else if (lowerMessage.includes('editor') || lowerMessage.includes('no active')) {
      code = ErrorCode.NO_ACTIVE_EDITOR;
    } else if (lowerMessage.includes('cors') || lowerMessage.includes('cross-origin')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (lowerMessage.includes('dns') || lowerMessage.includes('name resolution')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (lowerMessage.includes('certificate') || lowerMessage.includes('ssl') || lowerMessage.includes('tls')) {
      code = ErrorCode.NETWORK_ERROR;
    } else if (lowerMessage.includes('quota') || lowerMessage.includes('rate limit') || lowerMessage.includes('429')) {
      code = ErrorCode.AI_SERVICE_ERROR;
    } else if (lowerMessage.includes('model') && (lowerMessage.includes('not found') || lowerMessage.includes('unavailable'))) {
      code = ErrorCode.AI_SERVICE_ERROR;
    }

    return this.createError(code, undefined, { originalError: errorMessage, errorName });
  }

  /**
   * 获取用户友好的错误消息
   */
  static getFriendlyMessage(error: DocMateError | Error | any): string {
    if (error && typeof error === 'object' && 'code' in error) {
      const docMateError = error as DocMateError;
      return ERROR_MESSAGES[docMateError.code as ErrorCode] || docMateError.message;
    }

    if (error instanceof Error) {
      return this.fromError(error).message;
    }

    return ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
  }

  /**
   * 检查是否为网络相关错误
   */
  static isNetworkError(error: DocMateError): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_TIMEOUT,
      ErrorCode.AI_SERVICE_ERROR
    ].includes(error.code as ErrorCode);
  }

  /**
   * 检查是否为配置相关错误
   */
  static isConfigError(error: DocMateError): boolean {
    return [
      ErrorCode.CONFIG_MISSING,
      ErrorCode.CONFIG_INVALID,
      ErrorCode.INVALID_API_KEY
    ].includes(error.code as ErrorCode);
  }

  /**
   * 检查是否为用户操作错误
   */
  static isUserError(error: DocMateError): boolean {
    return [
      ErrorCode.INVALID_TEXT,
      ErrorCode.NO_ACTIVE_EDITOR,
      ErrorCode.ORIGINAL_TEXT_NOT_FOUND,
      ErrorCode.TEXT_TOO_LONG
    ].includes(error.code as ErrorCode);
  }

  /**
   * 获取错误的建议操作
   */
  static getSuggestedAction(error: DocMateError): string {
    const code = error.code as ErrorCode;
    
    switch (code) {
      case ErrorCode.NETWORK_ERROR:
      case ErrorCode.CONNECTION_TIMEOUT:
        return '请检查网络连接后重试';
      
      case ErrorCode.INVALID_API_KEY:
      case ErrorCode.CONFIG_MISSING:
      case ErrorCode.CONFIG_INVALID:
        return '请在设置中检查AI服务配置';
      
      case ErrorCode.NO_ACTIVE_EDITOR:
        return '请打开一个文档后重试';
      
      case ErrorCode.INVALID_TEXT:
      case ErrorCode.ORIGINAL_TEXT_NOT_FOUND:
        return '请选择有效的文本内容';
      
      case ErrorCode.TEXT_TOO_LONG:
        return '请将文本分段处理';
      
      case ErrorCode.JSON_PARSE_ERROR:
      case ErrorCode.RESPONSE_FORMAT_ERROR:
        return '请重试，如果问题持续请联系支持';
      
      default:
        return '请重试或联系技术支持';
    }
  }

  /**
   * 格式化错误用于日志记录
   */
  static formatForLogging(error: DocMateError): string {
    return `[${error.code}] ${error.message} (${new Date(error.timestamp).toISOString()})${
      error.details ? ` Details: ${JSON.stringify(error.details)}` : ''
    }`;
  }
}
