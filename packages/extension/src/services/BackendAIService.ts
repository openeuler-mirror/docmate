import { configService } from '@docmate/utils';
import { createError, ChatMessage, AIResponse, ErrorCode } from '@docmate/shared';
import { AuthService } from './AuthService';
import { ErrorHandlingService } from './ErrorHandlingService';

export interface BackendAIOptions {
  conversationHistory?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * 后端AI服务
 * 通过后端代理调用AI服务，支持认证
 */
export class BackendAIService {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * 检查文本
   */
  async check(text: string, options: any = {}): Promise<any> {
    return this.makeRequest('/api/v1/check', {
      text,
      options
    });
  }

  /**
   * 润色文本
   */
  async polish(text: string, options: any = {}): Promise<any> {
    return this.makeRequest('/api/v1/polish', {
      text,
      options
    });
  }

  /**
   * 翻译文本
   */
  async translate(text: string, options: any = {}): Promise<any> {
    return this.makeRequest('/api/v1/translate', {
      text,
      target_language: options.targetLanguage || 'en-US',
      preserve_terminology: options.preserveTerminology !== false
    });
  }

  /**
   * 改写文本
   */
  async rewrite(text: string, options: any = {}): Promise<any> {
    // 构建包含选中文本信息的指令
    let instruction = options.instruction || '请改写以下文本';

    // 如果有原始选中文本，在指令中包含它
    if (options.originalText && options.originalText !== text) {
      instruction = `用户选中了以下文本："${options.originalText}"，请根据用户的指令"${text}"对选中的文本进行改写。`;
    }

    return this.makeRequest('/api/v1/rewrite', {
      text: options.originalText || text, // 使用原始选中文本作为要改写的内容
      instruction: instruction,
      conversation_history: options.conversationHistory || []
    });
  }

  /**
   * 发起后端请求
   */
  private async makeRequest(endpoint: string, payload: any): Promise<any> {
    const backendUrl = configService.getBackendBaseUrl();
    
    if (!backendUrl) {
      throw createError(
        'BACKEND_CONFIG_MISSING',
        'Backend service URL is not configured.'
      );
    }

    if (!this.authService.isAuthenticated()) {
      throw createError(
        'AUTH_REQUIRED',
        'Authentication required for AI operations.'
      );
    }

    const controller = new AbortController();
    const timeout = 30000; // 30秒超时

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      console.log('BackendAIService: Making request to:', `${backendUrl}${endpoint}`);
      console.log('BackendAIService: Payload:', payload);

      const response = await fetch(`${backendUrl}${endpoint}`, {
        method: 'POST',
        headers: this.authService.getAuthHeaders(),
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      console.log('BackendAIService: Response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        const error = ErrorHandlingService.createError(
          response.status === 401 ? ErrorCode.AUTH_EXPIRED : ErrorCode.BACKEND_REQUEST_FAILED,
          response.status === 401 ? 'Authentication expired. Please login again.' : `Backend request failed: ${response.status} ${errorText}`
        );
        ErrorHandlingService.logError(error, 'BackendAIService.makeRequest - HTTP Error');
        throw error;
      }

      const data = await response.json();
      console.log('BackendAIService: Response data:', data);

      return data;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw ErrorHandlingService.createError(ErrorCode.REQUEST_TIMEOUT, 'Request timed out');
      }

      if (error instanceof Error && error.message.includes('AUTH_')) {
        throw error; // 重新抛出认证相关错误
      }

      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.BACKEND_REQUEST_FAILED);
      ErrorHandlingService.logError(docMateError, 'BackendAIService.makeRequest');
      throw docMateError;
    }
  }

  /**
   * 检查后端服务状态
   */
  async checkBackendStatus(): Promise<boolean> {
    try {
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/status`);
      return response.ok;
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.BACKEND_REQUEST_FAILED);
      ErrorHandlingService.logError(docMateError, 'BackendAIService.checkBackendStatus');
      return false;
    }
  }

  /**
   * 获取后端服务信息
   */
  async getBackendInfo(): Promise<any> {
    try {
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/status`);
      
      if (response.ok) {
        return await response.json();
      }
      
      throw ErrorHandlingService.createError(ErrorCode.BACKEND_REQUEST_FAILED, `Backend not available: ${response.status}`);
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.BACKEND_REQUEST_FAILED);
      ErrorHandlingService.logError(docMateError, 'BackendAIService.getBackendInfo');
      throw docMateError;
    }
  }
}
