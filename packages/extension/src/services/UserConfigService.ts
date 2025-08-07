import * as vscode from 'vscode';

/**
 * 用户AI配置接口
 */
export interface UserAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 用户配置服务
 * 使用VS Code的globalState来存储用户配置
 */
export class UserConfigService {
  private static instance: UserConfigService;
  private context: vscode.ExtensionContext | null = null;
  private readonly CONFIG_KEY = 'docmate.user.aiConfig';

  private constructor() {}

  public static getInstance(): UserConfigService {
    if (!UserConfigService.instance) {
      UserConfigService.instance = new UserConfigService();
    }
    return UserConfigService.instance;
  }

  /**
   * 初始化配置服务
   */
  public initialize(context: vscode.ExtensionContext): void {
    this.context = context;
  }

  /**
   * 获取AI配置
   */
  public async getAIConfig(): Promise<UserAIConfig | null> {
    if (!this.context) {
      throw new Error('UserConfigService not initialized');
    }

    const config = await this.context.globalState.get<UserAIConfig>(this.CONFIG_KEY);
    return config || null;
  }

  /**
   * 保存AI配置
   */
  public async saveAIConfig(config: UserAIConfig): Promise<void> {
    if (!this.context) {
      throw new Error('UserConfigService not initialized');
    }

    // 验证配置
    this.validateAIConfig(config);

    await this.context.globalState.update(this.CONFIG_KEY, config);
    console.log('UserConfigService: AI config saved successfully');
  }

  /**
   * 检查是否已配置
   */
  public async isConfigured(): Promise<boolean> {
    const config = await this.getAIConfig();
    return config !== null && this.isValidConfig(config);
  }

  /**
   * 清除配置
   */
  public async clearConfig(): Promise<void> {
    if (!this.context) {
      throw new Error('UserConfigService not initialized');
    }

    await this.context.globalState.update(this.CONFIG_KEY, undefined);
    console.log('UserConfigService: AI config cleared');
  }

  /**
   * 获取默认配置
   */
  public getDefaultConfig(): UserAIConfig {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-3.5-turbo'
    };
  }

  /**
   * 验证AI配置
   */
  private validateAIConfig(config: UserAIConfig): void {
    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      throw new Error('Base URL is required and must be a string');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw new Error('API Key is required and must be a string');
    }

    if (!config.model || typeof config.model !== 'string') {
      throw new Error('Model is required and must be a string');
    }

    // 验证URL格式
    try {
      new URL(config.baseUrl);
    } catch {
      throw new Error('Base URL must be a valid URL');
    }

    // 验证API Key不为空
    if (config.apiKey.trim().length === 0) {
      throw new Error('API Key cannot be empty');
    }

    // 验证模型名称不为空
    if (config.model.trim().length === 0) {
      throw new Error('Model name cannot be empty');
    }
  }

  /**
   * 检查配置是否有效
   */
  private isValidConfig(config: UserAIConfig): boolean {
    try {
      this.validateAIConfig(config);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 获取配置状态信息
   */
  public async getConfigStatus(): Promise<{
    isConfigured: boolean;
    hasBaseUrl: boolean;
    hasApiKey: boolean;
    hasModel: boolean;
    config?: UserAIConfig;
  }> {
    const config = await this.getAIConfig();
    
    if (!config) {
      return {
        isConfigured: false,
        hasBaseUrl: false,
        hasApiKey: false,
        hasModel: false
      };
    }

    return {
      isConfigured: this.isValidConfig(config),
      hasBaseUrl: !!config.baseUrl,
      hasApiKey: !!config.apiKey,
      hasModel: !!config.model,
      config: config
    };
  }

  /**
   * 更新部分配置
   */
  public async updateAIConfig(partialConfig: Partial<UserAIConfig>): Promise<void> {
    const currentConfig = await this.getAIConfig();
    const newConfig = {
      ...this.getDefaultConfig(),
      ...currentConfig,
      ...partialConfig
    };

    await this.saveAIConfig(newConfig);
  }
}

// 导出单例实例
export const userConfigService = UserConfigService.getInstance();
