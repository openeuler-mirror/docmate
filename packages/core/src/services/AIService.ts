import { AIServiceConfig, DocMateError, createError, ChatMessage, AIResponse } from '@docmate/shared';
import { configService } from './ConfigService';

export interface AIGenerateOptions {
  conversationHistory?: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

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
   * 生成AI响应 - 支持对话历史
   */
  async generate(prompt: string, options: AIGenerateOptions = {}): Promise<AIResponse> {
    // 优先使用configService的配置，如果没有则使用实例配置
    const apiKey = configService.getApiKey() || this.config.apiKey;
    const endpoint = configService.getBaseUrl() || this.config.endpoint;

    if (!apiKey || !endpoint) {
      throw createError(
        'AI_CONFIG_MISSING',
        'AI service configuration is incomplete. Please check API key and endpoint.'
      );
    }

    const maxRetries = configService.getMaxRetries() || this.config.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(prompt, options);
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxRetries) {
          // 指数退避重试
          const delay = Math.pow(2, attempt) * 1000;
          await this.delay(delay);
          continue;
        }
      }
    }

    throw createError(
      'AI_REQUEST_FAILED',
      `Failed to generate AI response after ${maxRetries} attempts: ${lastError?.message}`,
      { originalError: lastError }
    );
  }

  /**
   * 发起HTTP请求 - 支持对话历史
   */
  private async makeRequest(prompt: string, options: AIGenerateOptions = {}): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = configService.getTimeout() || this.config.timeout || 30000;
    const apiKey = configService.getApiKey() || this.config.apiKey;
    const endpoint = configService.getBaseUrl() || this.config.endpoint;
    const model = configService.getModelName() || this.config.model || 'gpt-3.5-turbo';

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      console.log('AIService: Making request to endpoint:', endpoint);
      console.log('AIService: Using model:', model);
      console.log('AIService: API key present:', !!apiKey);

      // 构建消息数组
      const messages: Array<{ role: string; content: string }> = [];

      // 添加对话历史
      if (options.conversationHistory) {
        messages.push(...options.conversationHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })));
      }

      // 添加当前prompt（如果不在历史中）
      if (!options.conversationHistory ||
          !options.conversationHistory.some(msg => msg.content === prompt && msg.role === 'user')) {
        messages.push({
          role: 'user',
          content: prompt,
        });
      }

      console.log('AIService: Sending messages:', messages);

      const requestBody = {
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
      };

      console.log('AIService: Request body:', requestBody);

      const response = await fetch(endpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      console.log('AIService: Response status:', response.status);
      console.log('AIService: Response headers:', Object.fromEntries(response.headers.entries()));

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AIService: HTTP error response:', errorText);
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      console.log('AIService: Response data:', data);

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        console.error('AIService: Invalid response format:', data);
        throw new Error('Invalid response format from AI service');
      }

      console.log('AIService: Generated content:', data.choices[0].message.content);

      return {
        success: true,
        content: data.choices[0].message.content,
      };
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('AIService: Request failed:', error);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }

      throw error;
    }
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 验证配置
   */
  validateConfig(): boolean {
    const apiKey = configService.getApiKey() || this.config.apiKey;
    const endpoint = configService.getBaseUrl() || this.config.endpoint;
    return !!(apiKey && endpoint);
  }

  /**
   * 获取当前配置状态
   */
  getConfigStatus(): { isValid: boolean; missingFields: string[] } {
    const apiKey = configService.getApiKey() || this.config.apiKey;
    const endpoint = configService.getBaseUrl() || this.config.endpoint;
    const missingFields: string[] = [];

    if (!apiKey) {
      missingFields.push('apiKey');
    }

    if (!endpoint) {
      missingFields.push('endpoint');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }
}
