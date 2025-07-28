import { AIServiceConfig, DocMateError, createError, ChatMessage, AIResponse } from '@docmate/shared';

export interface AIGenerateOptions {
  conversationHistory?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * AI服务类 - 已废弃
 * @deprecated 请使用extension包中的BackendAIService
 *
 * 这个类保留是为了向后兼容，但所有功能都已迁移到BackendAIService
 */
export class AIService {
  private config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AIServiceConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 生成AI响应 - 已废弃
   * @deprecated 请使用extension中的BackendAIService
   */
  async generate(prompt: string, options: AIGenerateOptions = {}): Promise<AIResponse> {
    throw createError(
      'DEPRECATED_METHOD',
      'AIService.generate is deprecated. Please use BackendAIService in extension package.'
    );
  }

  /**
   * 验证配置
   */
  validateConfig(): boolean {
    // 由于已废弃，总是返回false
    return false;
  }

  /**
   * 获取配置状态
   */
  getConfigStatus(): { isValid: boolean; missingFields: string[] } {
    return {
      isValid: false,
      missingFields: ['deprecated - use BackendAIService']
    };
  }
}