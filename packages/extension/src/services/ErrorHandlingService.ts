import * as vscode from 'vscode';
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
   * 错误类型映射规则（按优先级排序）
   */
  private static readonly ERROR_PATTERNS = new Map<ErrorCode, Array<(name: string, msg: string) => boolean>>([
    // 连接和超时错误（最高优先级）
    [ErrorCode.CONNECTION_TIMEOUT, [
      (name) => name === 'AbortError',
      (name) => name === 'TimeoutError',
      (_, msg) => /timeout|timed out|aborted|abort/.test(msg)
    ]],

    // 认证错误（高优先级，需要精确匹配）
    [ErrorCode.INVALID_API_KEY, [
      (_, msg) => /无效的令牌|invalid.*token|unauthorized|401/.test(msg) && !/\b(503|500|502|504)\b/.test(msg)
    ]],

    // 网络错误
    [ErrorCode.NETWORK_ERROR, [
      (name, msg) => name === 'TypeError' && msg.includes('fetch'),
      (_, msg) => /network|fetch failed|cors|cross-origin|dns|name resolution|certificate|ssl|tls/.test(msg)
    ]],

    // AI服务特定错误
    [ErrorCode.AI_SERVICE_ERROR, [
      (_, msg) => /503|500|502|504/.test(msg), // 服务器错误
      (_, msg) => /无可用渠道|no.*available.*channel/.test(msg), // 渠道不可用
      (_, msg) => /quota|rate limit|429/.test(msg), // 配额限制
      (_, msg) => /model/.test(msg) && /not found|unavailable/.test(msg) // 模型不可用
    ]],

    // JSON解析错误
    [ErrorCode.JSON_PARSE_ERROR, [
      (name, msg) => name === 'SyntaxError' && msg.includes('json'),
      (_, msg) => /json|parse/.test(msg) && !/503|500|502|504/.test(msg)
    ]],

    // 配置错误
    [ErrorCode.CONFIG_INVALID, [
      (_, msg) => /config/.test(msg) && /missing|invalid/.test(msg)
    ]],

    // 文本处理错误
    [ErrorCode.ORIGINAL_TEXT_NOT_FOUND, [
      (_, msg) => /text/.test(msg) && /not found/.test(msg)
    ]],
    [ErrorCode.NO_ACTIVE_EDITOR, [
      (_, msg) => /editor|no active/.test(msg)
    ]]
  ]);

  /**
   * 从原始错误转换为友好错误
   */
  static fromError(error: Error | any, fallbackCode: ErrorCode = ErrorCode.UNKNOWN_ERROR): DocMateError {
    // 如果已经是DocMateError，直接返回
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      return error as DocMateError;
    }

    // 提取错误信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    const lowerMessage = errorMessage.toLowerCase();
    const errorName = error instanceof Error ? error.name : '';

    console.log('ErrorHandlingService: fromError processing:', {
      errorMessage,
      lowerMessage,
      errorName
    });

    // 优先检查认证相关错误（最高优先级）
    // 更精确的HTTP状态码匹配，避免误匹配request id中的数字
    const hasAuthError = /无效的令牌|invalid.*token|unauthorized|401/.test(lowerMessage);
    const hasHttpServerError = /\b(503|500|502|504)\b/.test(lowerMessage); // 使用单词边界确保精确匹配

    if (hasAuthError && !hasHttpServerError) {
      console.log('ErrorHandlingService: Detected INVALID_API_KEY error');
      return this.createError(ErrorCode.INVALID_API_KEY, undefined, { originalError: errorMessage, errorName });
    }

    // 查找匹配的错误码（跳过已经检查过的认证错误）
    for (const [errorCode, patterns] of this.ERROR_PATTERNS) {
      if (errorCode === ErrorCode.INVALID_API_KEY) {
        continue; // 已经在上面检查过了
      }

      if (patterns.some(pattern => pattern(errorName, lowerMessage))) {
        console.log('ErrorHandlingService: Matched error code:', errorCode);
        return this.createError(errorCode, undefined, { originalError: errorMessage, errorName });
      }
    }

    console.log('ErrorHandlingService: Using fallback error code:', fallbackCode);
    return this.createError(fallbackCode, undefined, { originalError: errorMessage, errorName });
  }

  /**
   * 提取具体错误信息
   */
  private static extractSpecificErrorMessage(errorMessage: string): string | null {
    console.log('ErrorHandlingService: Extracting specific error message from:', errorMessage);

    // 1. 提取 API 错误中的具体信息
    const apiErrorMatch = errorMessage.match(/"message":"([^"]+)"/);
    if (apiErrorMatch) {
      console.log('ErrorHandlingService: Found API error message:', apiErrorMatch[1]);
      return apiErrorMatch[1];
    }

    // 2. 提取中文错误信息（针对"当前分组 xxx 下对于模型 xxx 无可用渠道"等）
    const chineseErrorPatterns = [
      /当前分组\s*[^下]*下对于模型\s*[^无]*无可用渠道/,
      /模型\s*[^不]*不可用/,
      /配额不足/,
      /请求频率过高/,
      /API\s*密钥无效/,
      /无效的令牌/,
      /令牌无效/,
      /认证失败/,
      /服务暂时不可用/
    ];

    for (const pattern of chineseErrorPatterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        console.log('ErrorHandlingService: Found Chinese error pattern:', match[0]);
        return match[0];
      }
    }

    // 3. 提取HTTP状态码错误信息
    const httpErrorMatch = errorMessage.match(/(?:HTTP\s+)?(\d{3})\s*[-:]\s*([^,\n\r]+)/i);
    if (httpErrorMatch) {
      const statusCode = httpErrorMatch[1];
      const statusText = httpErrorMatch[2].trim();
      console.log('ErrorHandlingService: Found HTTP error:', `${statusCode} ${statusText}`);
      return `HTTP ${statusCode}: ${statusText}`;
    }

    // 4. 提取英文错误信息
    const englishErrorPatterns = [
      /no\s+available\s+channel[^.]*(?:\.|$)/i,
      /model\s+[^.]*(?:not\s+found|unavailable)[^.]*(?:\.|$)/i,
      /quota\s+exceeded[^.]*(?:\.|$)/i,
      /rate\s+limit\s+exceeded[^.]*(?:\.|$)/i,
      /invalid\s+api\s+key[^.]*(?:\.|$)/i,
      /service\s+unavailable[^.]*(?:\.|$)/i,
      /gateway\s+timeout[^.]*(?:\.|$)/i,
      /bad\s+gateway[^.]*(?:\.|$)/i,
      /internal\s+server\s+error[^.]*(?:\.|$)/i
    ];

    for (const pattern of englishErrorPatterns) {
      const match = errorMessage.match(pattern);
      if (match) {
        console.log('ErrorHandlingService: Found English error pattern:', match[0]);
        return match[0].replace(/\.$/, ''); // 移除末尾的句号
      }
    }

    // 5. 提取其他格式的错误信息
    const errorMatch = errorMessage.match(/error['":\s]*([^,}]+)/i);
    if (errorMatch) {
      const extracted = errorMatch[1].replace(/['"]/g, '');
      console.log('ErrorHandlingService: Found generic error:', extracted);
      return extracted;
    }

    // 6. 如果是纯中文错误信息且较短，直接返回
    if (/^[\u4e00-\u9fa5\s，。！？：；""''（）【】]+$/.test(errorMessage) && errorMessage.length < 100) {
      console.log('ErrorHandlingService: Using pure Chinese error message:', errorMessage);
      return errorMessage;
    }

    console.log('ErrorHandlingService: No specific error message found');
    return null;
  }

  /**
   * 获取用户友好的错误消息
   */
  static getFriendlyMessage(error: DocMateError | Error | any): string {
    console.log('ErrorHandlingService: Getting friendly message for error:', error);

    if (error && typeof error === 'object' && 'code' in error) {
      const docMateError = error as DocMateError;
      const standardMessage = ERROR_MESSAGES[docMateError.code as ErrorCode];

      console.log('ErrorHandlingService: DocMateError detected:', {
        code: docMateError.code,
        message: docMateError.message,
        standardMessage,
        details: docMateError.details
      });

      // 对于特定错误类型，尝试提取更具体的信息
      if (docMateError.code === ErrorCode.AI_SERVICE_ERROR || docMateError.code === ErrorCode.INVALID_API_KEY) {
        const originalError = docMateError.details?.originalError || docMateError.message;
        console.log('ErrorHandlingService: Processing AI service error, originalError:', originalError);

        const specificMessage = this.extractSpecificErrorMessage(originalError);
        console.log('ErrorHandlingService: Extracted specific message:', specificMessage);

        if (specificMessage && specificMessage.trim().length > 0) {
          const finalMessage = `${standardMessage}：${specificMessage}`;
          console.log('ErrorHandlingService: Final message with details:', finalMessage);
          return finalMessage;
        }

        // 如果提取失败，但原始错误信息有价值，直接使用
        if (originalError && typeof originalError === 'string' &&
            originalError.length > 0 &&
            originalError !== standardMessage &&
            !originalError.includes('Error:') &&
            originalError.length < 200) {
          const finalMessage = `${standardMessage}：${originalError}`;
          console.log('ErrorHandlingService: Using original error as fallback:', finalMessage);
          return finalMessage;
        }
      }

      // 如果有标准消息，使用标准消息
      if (standardMessage) {
        console.log('ErrorHandlingService: Using standard message:', standardMessage);
        return standardMessage;
      }

      // 如果没有标准消息但有自定义消息，使用自定义消息
      if (docMateError.message && docMateError.message !== ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR]) {
        console.log('ErrorHandlingService: Using custom message:', docMateError.message);
        return docMateError.message;
      }

      const fallbackMessage = docMateError.message || ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
      console.log('ErrorHandlingService: Using fallback message:', fallbackMessage);
      return fallbackMessage;
    }

    if (error instanceof Error) {
      console.log('ErrorHandlingService: Converting Error to DocMateError:', error.message);
      const convertedError = this.fromError(error);
      return this.getFriendlyMessage(convertedError);
    }

    // 如果是字符串错误，直接显示
    if (typeof error === 'string' && error.length > 0) {
      const stringMessage = `${ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR]}：${error}`;
      console.log('ErrorHandlingService: Using string error:', stringMessage);
      return stringMessage;
    }

    const unknownMessage = ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
    console.log('ErrorHandlingService: Using unknown error message:', unknownMessage);
    return unknownMessage;
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
      
      case ErrorCode.AI_SERVICE_ERROR:
        return '服务暂时不可用，请稍后重试或检查网络连接';

      case ErrorCode.JSON_PARSE_ERROR:
      case ErrorCode.RESPONSE_FORMAT_ERROR:
        return '请重试，如果问题持续请联系支持';

      default:
        return '请重试或联系技术支持';
    }
  }

  /**
   * 格式化错误用于日志记录（带 DocMate: 前缀）
   */
  static formatForLogging(error: DocMateError): string {
    let timestampStr = '';
    try {
      // 确保 timestamp 是有效的数字
      const timestamp = typeof error.timestamp === 'number' && !isNaN(error.timestamp)
        ? error.timestamp
        : Date.now();
      timestampStr = new Date(timestamp).toISOString();
    } catch (e) {
      timestampStr = new Date().toISOString();
    }

    let detailsStr = '';
    try {
      if (error.details) {
        detailsStr = ` Details: ${JSON.stringify(error.details)}`;
      }
    } catch (e) {
      detailsStr = ` Details: [Serialization Error]`;
    }

    return `DocMate: [${error.code || 'UNKNOWN'}] ${error.message || 'Unknown error'} (${timestampStr})${detailsStr}`;
  }

  /**
   * 统一的错误日志记录方法
   */
  static logError(error: DocMateError | Error | any, context?: string): void {
    const docMateError = this.normalizeError(error);
    const contextPrefix = context ? `${context}: ` : '';
    console.error(`${contextPrefix}${this.formatForLogging(docMateError)}`);
  }

  /**
   * 统一的 VS Code 错误消息显示方法
   */
  static async showVSCodeError(error: DocMateError | Error | any, actions?: string[]): Promise<string | undefined> {
    const docMateError = this.normalizeError(error);
    const friendlyMessage = this.getFriendlyMessage(docMateError);
    const suggestion = this.getSuggestedAction(docMateError);

    // 构建详细的错误消息
    let fullMessage = friendlyMessage;

    // 如果有上下文信息，添加到消息中
    if (docMateError.details && docMateError.details.context) {
      fullMessage = `[${docMateError.details.context}] ${fullMessage}`;
    }

    // 添加建议操作
    if (suggestion) {
      fullMessage += `\n\n💡 ${suggestion}`;
    }

    // 如果是开发模式或者有详细错误信息，添加技术细节
    if (docMateError.details && docMateError.details.originalError &&
        docMateError.code !== ErrorCode.UNKNOWN_ERROR) {
      const originalError = docMateError.details.originalError;
      if (typeof originalError === 'string' && originalError.length > 0 &&
          !fullMessage.includes(originalError)) {
        fullMessage += `\n\n🔍 技术详情：${originalError}`;
      }
    }

    // 记录错误日志
    this.logError(docMateError, 'VS Code Error Display');

    if (actions && actions.length > 0) {
      return await vscode.window.showErrorMessage(fullMessage, ...actions);
    } else {
      vscode.window.showErrorMessage(fullMessage);
      return undefined;
    }
  }

  /**
   * 标准化错误对象（内部使用）
   */
  private static normalizeError(error: DocMateError | Error | any): DocMateError {
    if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
      const docMateError = error as DocMateError;
      // 确保 timestamp 是有效的
      if (typeof docMateError.timestamp !== 'number' || isNaN(docMateError.timestamp)) {
        docMateError.timestamp = Date.now();
      }
      return docMateError;
    }

    if (error instanceof Error) {
      return this.fromError(error);
    }

    return this.createError(ErrorCode.UNKNOWN_ERROR, String(error));
  }

  /**
   * 检查是否为可重试的错误
   */
  static isRetryableError(error: DocMateError): boolean {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_TIMEOUT,
      ErrorCode.AI_SERVICE_ERROR
    ].includes(error.code as ErrorCode);
  }

  /**
   * 检查是否为致命错误（需要停止操作）
   */
  static isFatalError(error: DocMateError): boolean {
    return [
      ErrorCode.INVALID_API_KEY,
      ErrorCode.CONFIG_MISSING,
      ErrorCode.CONFIG_INVALID,
      ErrorCode.AUTH_FAILED,
      ErrorCode.AUTH_EXPIRED
    ].includes(error.code as ErrorCode);
  }

  /**
   * 获取错误的严重程度
   */
  static getErrorSeverity(error: DocMateError): 'low' | 'medium' | 'high' | 'critical' {
    const code = error.code as ErrorCode;

    if (this.isFatalError(error)) {
      return 'critical';
    }

    if ([ErrorCode.AI_SERVICE_ERROR, ErrorCode.NETWORK_ERROR].includes(code)) {
      return 'high';
    }

    if (this.isUserError(error)) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 创建带有上下文信息的错误
   */
  static createContextualError(
    code: ErrorCode,
    message: string,
    context: string,
    details?: any
  ): DocMateError {
    return this.createError(code, message, {
      context,
      ...details
    });
  }
}
