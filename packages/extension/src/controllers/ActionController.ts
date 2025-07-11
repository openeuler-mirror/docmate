import * as vscode from 'vscode';
import {
  AIService,
  TerminologyService,
  CheckAction,
  PolishAction,
  TranslateAction
} from '@docmate/core';
import {
  AIServiceConfig,
  CheckResultItem,
  PolishResultItem,
  TranslateResultItem,
  createError
} from '@docmate/shared';

export class ActionController {
  private aiService: AIService;
  private terminologyService: TerminologyService;

  constructor() {
    // 初始化服务
    this.terminologyService = new TerminologyService();
    this.aiService = new AIService(this.getAIConfig());
  }

  /**
   * 处理命令
   */
  async handle(command: string, payload: any): Promise<any> {
    switch (command) {
      case 'check':
        return this.handleCheck(payload);
      case 'polish':
        return this.handlePolish(payload);
      case 'translate':
        return this.handleTranslate(payload);
      case 'refresh':
        return this.handleRefresh(payload);
      case 'settings':
        return this.handleSettings(payload);
      default:
        throw createError('UNKNOWN_COMMAND', `Unknown command: ${command}`);
    }
  }

  /**
   * 处理检查命令
   */
  private async handleCheck(payload: any): Promise<CheckResultItem[]> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for check operation');
    }

    return CheckAction.execute(
      text,
      this.aiService,
      this.terminologyService,
      options
    );
  }

  /**
   * 处理润色命令
   */
  private async handlePolish(payload: any): Promise<PolishResultItem[]> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for polish operation');
    }

    return PolishAction.execute(text, this.aiService, options);
  }

  /**
   * 处理翻译命令
   */
  private async handleTranslate(payload: any): Promise<TranslateResultItem[]> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for translate operation');
    }

    if (!options.targetLanguage) {
      throw createError('MISSING_TARGET_LANGUAGE', 'Target language is required for translation');
    }

    return TranslateAction.execute(text, this.aiService, options);
  }

  /**
   * 处理刷新命令
   */
  private async handleRefresh(payload: any): Promise<{ status: string }> {
    // 重新加载配置
    this.updateConfiguration();

    // 重新加载术语库
    this.terminologyService = new TerminologyService();

    return { status: 'refreshed' };
  }

  /**
   * 处理设置命令
   */
  private async handleSettings(payload: any): Promise<any> {
    // 从payload中提取action和data
    let action, data;

    if (payload.options && payload.options.action) {
      action = payload.options.action;
      data = payload.options.data;
    } else if (payload.action) {
      action = payload.action;
      data = payload.data;
    } else {
      // 默认为get操作
      action = 'get';
      data = null;
    }

    switch (action) {
      case 'get':
        return this.getSettings();
      case 'update':
        return this.updateSettings(data);
      case 'validate':
        return this.validateSettings();
      default:
        throw createError('UNKNOWN_SETTINGS_ACTION', `Unknown settings action: ${action}`);
    }
  }

  /**
   * 获取设置
   */
  private getSettings(): any {
    const config = vscode.workspace.getConfiguration('docmate');

    return {
      aiService: {
        apiKey: config.get('aiService.apiKey', ''),
        endpoint: config.get('aiService.endpoint', ''),
      },
      terminology: {
        autoCheck: config.get('terminology.autoCheck', true),
      },
      // 不返回敏感信息如API密钥的完整值
      masked: {
        hasApiKey: !!config.get('aiService.apiKey', ''),
        hasEndpoint: !!config.get('aiService.endpoint', ''),
      }
    };
  }

  /**
   * 更新设置
   */
  private async updateSettings(data: any): Promise<{ status: string }> {
    const config = vscode.workspace.getConfiguration('docmate');

    try {
      if (data.aiService) {
        if (data.aiService.apiKey !== undefined) {
          await config.update('aiService.apiKey', data.aiService.apiKey, vscode.ConfigurationTarget.Global);
        }
        if (data.aiService.endpoint !== undefined) {
          await config.update('aiService.endpoint', data.aiService.endpoint, vscode.ConfigurationTarget.Global);
        }
      }

      if (data.terminology) {
        if (data.terminology.autoCheck !== undefined) {
          await config.update('terminology.autoCheck', data.terminology.autoCheck, vscode.ConfigurationTarget.Global);
        }
      }

      // 更新AI服务配置
      this.updateConfiguration();

      return { status: 'updated' };
    } catch (error) {
      throw createError('SETTINGS_UPDATE_FAILED', 'Failed to update settings', { originalError: error });
    }
  }

  /**
   * 验证设置
   */
  private validateSettings(): any {
    const configStatus = this.aiService.getConfigStatus();

    return {
      aiService: configStatus,
      terminology: {
        isLoaded: !!this.terminologyService.getDatabase(),
      }
    };
  }

  /**
   * 更新配置
   */
  updateConfiguration(): void {
    const newConfig = this.getAIConfig();
    this.aiService.updateConfig(newConfig);
  }

  /**
   * 获取AI配置
   */
  private getAIConfig(): AIServiceConfig {
    const config = vscode.workspace.getConfiguration('docmate');

    return {
      apiKey: config.get('aiService.apiKey', ''),
      endpoint: config.get('aiService.endpoint', ''),
      timeout: 30000,
      maxRetries: 3,
    };
  }
}
