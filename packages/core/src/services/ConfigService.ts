import { UserSettings } from '@docmate/shared';

/**
 * ConfigService - 配置管理服务
 * 用于在core模块内部存储和提供配置信息
 */
class ConfigService {
  private static instance: ConfigService;
  private config: Partial<UserSettings['aiService']> = {};

  private constructor() {}

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  /**
   * 设置配置
   */
  public setConfig(config: Partial<UserSettings['aiService']>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取完整配置
   */
  public getConfig(): Partial<UserSettings['aiService']> {
    return this.config;
  }

  /**
   * 获取API Key
   */
  public getApiKey(): string | undefined {
    return this.config.apiKey;
  }

  /**
   * 获取Base URL
   */
  public getBaseUrl(): string | undefined {
    return this.config.endpoint;
  }

  /**
   * 获取模型名称
   */
  public getModelName(): string | undefined {
    return this.config.model;
  }

  /**
   * 获取超时时间
   */
  public getTimeout(): number | undefined {
    return this.config.timeout;
  }

  /**
   * 获取最大重试次数
   */
  public getMaxRetries(): number | undefined {
    return this.config.maxRetries;
  }

  /**
   * 验证配置是否完整
   */
  public isConfigValid(): boolean {
    return !!(this.config.apiKey && this.config.endpoint);
  }

  /**
   * 获取缺失的配置字段
   */
  public getMissingFields(): string[] {
    const missing: string[] = [];
    
    if (!this.config.apiKey) {
      missing.push('apiKey');
    }
    
    if (!this.config.endpoint) {
      missing.push('endpoint');
    }
    
    return missing;
  }

  /**
   * 重置配置
   */
  public resetConfig(): void {
    this.config = {};
  }
}

export const configService = ConfigService.getInstance();
export { ConfigService };
