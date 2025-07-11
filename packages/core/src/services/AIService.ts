import { AIServiceConfig, DocMateError, createError } from '@docmate/shared';

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
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
   * 生成AI响应
   */
  async generate(prompt: string): Promise<AIResponse> {
    if (!this.config.apiKey || !this.config.endpoint) {
      throw createError(
        'AI_CONFIG_MISSING',
        'AI service configuration is incomplete. Please check API key and endpoint.'
      );
    }

    const maxRetries = this.config.maxRetries || 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.makeRequest(prompt);
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
   * 发起HTTP请求
   */
  private async makeRequest(prompt: string): Promise<AIResponse> {
    const controller = new AbortController();
    const timeout = this.config.timeout || 30000;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model || 'gpt-3.5-turbo',
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from AI service');
      }

      return {
        content: data.choices[0].message.content,
        usage: data.usage,
      };
    } catch (error) {
      clearTimeout(timeoutId);

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
    return !!(this.config.apiKey && this.config.endpoint);
  }

  /**
   * 获取当前配置状态
   */
  getConfigStatus(): { isValid: boolean; missingFields: string[] } {
    const missingFields: string[] = [];

    if (!this.config.apiKey) {
      missingFields.push('apiKey');
    }

    if (!this.config.endpoint) {
      missingFields.push('endpoint');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
    };
  }
}
