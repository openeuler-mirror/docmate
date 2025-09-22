import * as vscode from 'vscode';
import { ErrorHandlingService } from './ErrorHandlingService';
import { createError, ErrorCode, CheckRule } from '@docmate/shared';

/**
 * 用户AI配置接口
 */
export interface UserAIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeout?: number;        // 超时时间（毫秒）
  maxRetries?: number;     // 最大重试次数
  testTimeout?: number;    // 测试连接超时时间（毫秒）
}

/**
 * 用户配置服务
 * 使用VS Code的globalState来存储用户配置
 */
export class UserConfigService {
  private static instance: UserConfigService;
  private context: vscode.ExtensionContext | null = null;
  private readonly CONFIG_KEY = 'docmate.user.aiConfig';
  private readonly CHECK_RULES_KEY = 'docmate.user.checkRules';
  private checkRulesCache: CheckRule[] | null = null;
  private lastCacheUpdate: number = 0;

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
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'UserConfigService not initialized');
    }

    const config = await this.context.globalState.get<UserAIConfig>(this.CONFIG_KEY);
    return config || null;
  }

  /**
   * 保存AI配置
   */
  public async saveAIConfig(config: UserAIConfig): Promise<void> {
    if (!this.context) {
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'UserConfigService not initialized');
    }

    // 验证配置
    this.validateAIConfig(config);

    await this.context.globalState.update(this.CONFIG_KEY, config);
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
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'UserConfigService not initialized');
    }

    await this.context.globalState.update(this.CONFIG_KEY, undefined);
  }

  /**
   * 获取默认配置
   */
  public getDefaultConfig(): UserAIConfig {
    return {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      timeout: 60000,        // 默认60秒超时
      maxRetries: 3,         // 默认重试3次
      testTimeout: 15000     // 默认测试连接15秒超时
    };
  }

  /**
   * 验证AI配置
   */
  private validateAIConfig(config: UserAIConfig): void {
    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      throw createError(ErrorCode.CONFIG_INVALID, 'Base URL is required and must be a string');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      throw createError(ErrorCode.CONFIG_INVALID, 'API Key is required and must be a string');
    }

    if (!config.model || typeof config.model !== 'string') {
      throw createError(ErrorCode.CONFIG_INVALID, 'Model is required and must be a string');
    }

    // 验证URL格式
    try {
      new URL(config.baseUrl);
    } catch {
      throw createError(ErrorCode.CONFIG_INVALID, 'Base URL must be a valid URL');
    }

    // 验证API Key不为空
    if (config.apiKey.trim().length === 0) {
      throw createError(ErrorCode.CONFIG_INVALID, 'API Key cannot be empty');
    }

    // 验证模型名称不为空
    if (config.model.trim().length === 0) {
      throw createError(ErrorCode.CONFIG_INVALID, 'Model name cannot be empty');
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
   * 获取完整配置（包含默认值）
   */
  public async getFullAIConfig(): Promise<UserAIConfig> {
    const currentConfig = await this.getAIConfig();
    return {
      ...this.getDefaultConfig(),
      ...currentConfig
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

  // ===== 检查规则管理方法 =====

  /**
   * 获取所有检查规则
   */
  public async getCheckRules(): Promise<CheckRule[]> {
    if (!this.context) {
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'UserConfigService not initialized');
    }

    // 使用缓存，减少globalState访问
    const now = Date.now();
    const cacheTimeout = 5000; // 5秒缓存

    if (this.checkRulesCache && (now - this.lastCacheUpdate) < cacheTimeout) {
      return this.checkRulesCache;
    }

    const rules = await this.context.globalState.get<CheckRule[]>(this.CHECK_RULES_KEY);

    let finalRules: CheckRule[];
    if (!rules) {
      finalRules = await this.initializeDefaultCheckRules();
    } else {
      finalRules = rules;
    }

    // 更新缓存
    this.checkRulesCache = finalRules;
    this.lastCacheUpdate = now;

    return finalRules;
  }

  /**
   * 保存检查规则
   */
  public async saveCheckRules(rules: CheckRule[]): Promise<void> {
    if (!this.context) {
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'UserConfigService not initialized');
    }

    // 验证规则
    this.validateCheckRules(rules);

    await this.context.globalState.update(this.CHECK_RULES_KEY, rules);

    // 清除缓存
    this.checkRulesCache = null;
    this.lastCacheUpdate = 0;
  }

  /**
   * 初始化默认检查规则
   */
  public async initializeDefaultCheckRules(): Promise<CheckRule[]> {
    const defaultRules: CheckRule[] = [
      {
        id: 'TYPO-001',
        name: '中文错别字检查',
        type: 'TYPO',
        description: '找出并修正中文错别字，包括同音字、形近字错误',
        content: '找出并修正中文错别字，包括同音字（如"部署"错为"布署"）、形近字（如"阈值"错为"阀值"），识别多余或缺失的文字。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'PUNCTUATION-001',
        name: '标点符号规范',
        type: 'PUNCTUATION',
        description: '检查标点符号使用规范，确保中英文标点正确使用',
        content: '纯英文内容中不应出现中文标点符号。顿号"、"仅用于句子内部的并列词语之间。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'SPACING-001',
        name: '空格规范',
        type: 'SPACING',
        description: '检查中英文夹杂时的空格使用规范',
        content: '中英文夹杂时必须有且仅有一个半角空格。英文标点符号后应有半角空格，前面不能有空格。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'FORMATTING-001',
        name: '格式规范',
        type: 'FORMATTING',
        description: '检查代码格式、文件名等格式要求',
        content: '行内代码、命令行和文件名需要用反引号 (`) 包裹，只有确认要包裹的再添加，不用特别严格，且```代码块内的命令不用管。代码块注释符号必须正确。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'STYLE-001',
        name: '风格一致性',
        type: 'STYLE',
        description: '检查文档风格的一致性，包括标点、格式等',
        content: '同级别内容的结尾标点应保持一致。描述功能键或UI元素的格式应在全文中保持一致。行间距应保持一致。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'HYPERLINK_ERROR-001',
        name: '超链接检查',
        type: 'HYPERLINK_ERROR',
        description: '检查超链接格式和描述的正确性',
        content: '外部手册链接应包含书名号《》，web链接则不需要。超链接文字描述应与实际内容相符。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      {
        id: 'TERMINOLOGY-001',
        name: '术语规范',
        type: 'TERMINOLOGY',
        description: '检查术语使用的正确性和一致性',
        content: '仅检查明显的术语大小写错误（如 "OpenEuler" 或 "openeuler" 应为 "openEuler"）。如果术语已经是正确格式，不要创建不必要的suggestion。确保术语在文档中的使用一致性。',
        enabled: true,
        isDefault: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ];

    await this.saveCheckRules(defaultRules);
    return defaultRules;
  }

  /**
   * 更新检查规则
   */
  public async updateCheckRules(updates: Partial<CheckRule>[]): Promise<CheckRule[]> {
    const currentRules = await this.getCheckRules();

    const updatedRules = currentRules.map(rule => {
      const update = updates.find(u => u.id === rule.id);
      if (update) {
        return {
          ...rule,
          ...update,
          updatedAt: new Date().toISOString(),
          // 不允许修改默认规则的标识信息
          isDefault: rule.isDefault
        };
      }
      return rule;
    });

    await this.saveCheckRules(updatedRules);
    return updatedRules;
  }

  /**
   * 创建新的检查规则
   */
  public async createCheckRules(newRules: Omit<CheckRule, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>[]): Promise<CheckRule[]> {
    const currentRules = await this.getCheckRules();

    const rulesToCreate: CheckRule[] = newRules.map((rule, index) => ({
      ...rule,
      id: `CUSTOM-${Date.now()}-${index}`,
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const finalRules = [...currentRules, ...rulesToCreate];
    await this.saveCheckRules(finalRules);
    return finalRules;
  }

  /**
   * 删除检查规则
   */
  public async deleteCheckRules(ruleIds: string[]): Promise<CheckRule[]> {
    const currentRules = await this.getCheckRules();

    // 不允许删除默认规则
    const hasDefaultRule = ruleIds.some(id => {
      const rule = currentRules.find(r => r.id === id);
      return rule?.isDefault;
    });

    if (hasDefaultRule) {
      throw createError(ErrorCode.CONFIG_INVALID, 'Cannot delete default rules');
    }

    const filteredRules = currentRules.filter(rule => !ruleIds.includes(rule.id));
    await this.saveCheckRules(filteredRules);
    return filteredRules;
  }

  /**
   * 验证检查规则
   */
  private validateCheckRules(rules: CheckRule[]): void {
    if (!Array.isArray(rules)) {
      throw createError(ErrorCode.CONFIG_INVALID, 'Check rules must be an array');
    }

    for (const rule of rules) {
      if (!rule.id || typeof rule.id !== 'string') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule ID is required and must be a string');
      }

      if (!rule.name || typeof rule.name !== 'string') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule name is required and must be a string');
      }

      if (!rule.description || typeof rule.description !== 'string') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule description is required and must be a string');
      }

      if (!rule.content || typeof rule.content !== 'string') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule content is required and must be a string');
      }

      if (typeof rule.enabled !== 'boolean') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule enabled must be a boolean');
      }

      if (typeof rule.isDefault !== 'boolean') {
        throw createError(ErrorCode.CONFIG_INVALID, 'Rule isDefault must be a boolean');
      }

      const validTypes = ['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'HYPERLINK_ERROR', 'TERMINOLOGY'];
      if (!validTypes.includes(rule.type)) {
        throw createError(ErrorCode.CONFIG_INVALID, `Invalid rule type: ${rule.type}`);
      }
    }
  }
}

// 导出单例实例
export const userConfigService = UserConfigService.getInstance();
