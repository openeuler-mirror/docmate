import * as vscode from 'vscode';
import {
  AIService,
  TerminologyService,
  CheckActionClass as CheckAction,
  PolishActionClass as PolishAction,
  TranslateActionClass as TranslateAction,
  RewriteActionClass as RewriteAction,
  configService
} from '@docmate/core';
import {
  AIServiceConfig,
  CheckResultItem,
  PolishResultItem,
  TranslateResultItem,
  CheckResult,
  PolishResult,
  TranslateResult,
  RewriteResult,
  ChatMessage,
  createError
} from '@docmate/shared';

export class ActionController {
  private aiService: AIService;
  private terminologyService: TerminologyService;

  constructor() {
    // 初始化服务
    this.terminologyService = new TerminologyService();
    this.aiService = new AIService(this.getAIConfig());

    // 初始化configService
    this.updateConfiguration();
  }

  /**
   * 处理命令
   */
  async handle(command: string, payload: any): Promise<any> {
    console.log('ActionController: Handling command:', command, 'with payload:', payload);

    try {
      let result;
      switch (command) {
        case 'check':
          console.log('ActionController: Executing check command');
          result = await this.handleCheck(payload);
          break;
        case 'polish':
          console.log('ActionController: Executing polish command');
          result = await this.handlePolish(payload);
          break;
        case 'translate':
          console.log('ActionController: Executing translate command');
          result = await this.handleTranslate(payload);
          break;
        case 'rewrite':
          console.log('ActionController: Executing rewrite command');
          result = await this.handleRewrite(payload);
          break;
        case 'applySuggestion':
          console.log('ActionController: Executing applySuggestion command');
          result = await this.handleApplySuggestion(payload);
          break;
        case 'refresh':
          console.log('ActionController: Executing refresh command');
          result = await this.handleRefresh(payload);
          break;
        case 'settings':
          console.log('ActionController: Executing settings command');
          result = await this.handleSettings(payload);
          break;
        default:
          throw createError('UNKNOWN_COMMAND', `Unknown command: ${command}`);
      }

      console.log('ActionController: Command', command, 'completed with result:', result);
      return result;
    } catch (error) {
      console.error('ActionController: Command', command, 'failed with error:', error);
      throw error;
    }
  }

  /**
   * 处理检查命令 - 返回新的diff格式
   */
  private async handleCheck(payload: any): Promise<CheckResult> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for check operation');
    }

    const action = new CheckAction(this.aiService, this.terminologyService);
    return action.execute({ text, checkOptions: options });
  }

  /**
   * 处理润色命令 - 返回新的diff格式
   */
  private async handlePolish(payload: any): Promise<PolishResult> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for polish operation');
    }

    const action = new PolishAction(this.aiService);
    return action.execute({ text, polishOptions: options });
  }

  /**
   * 处理翻译命令 - 返回新的diff格式
   */
  private async handleTranslate(payload: any): Promise<TranslateResult> {
    const { text, options = {} } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for translate operation');
    }

    if (!options.targetLanguage) {
      throw createError('MISSING_TARGET_LANGUAGE', 'Target language is required for translation');
    }

    const action = new TranslateAction(this.aiService);
    return action.execute({ text, translateOptions: options });
  }

  /**
   * 处理改写命令
   */
  private async handleRewrite(payload: any): Promise<RewriteResult> {
    const { text, conversationHistory = [], originalText } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for rewrite operation');
    }

    const action = new RewriteAction(this.aiService);
    return action.execute({
      text,
      conversationHistory,
      originalText,
    });
  }

  /**
   * 处理应用建议命令
   */
  private async handleApplySuggestion(payload: any): Promise<{ status: string }> {
    const { text } = payload;
    console.log('ActionController: handleApplySuggestion called with text:', text);

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for apply suggestion operation');
    }

    // 获取当前活动编辑器
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      console.error('ActionController: No active editor found');
      throw createError('NO_ACTIVE_EDITOR', 'No active editor found');
    }

    console.log('ActionController: Editor found, selection:', editor.selection);
    console.log('ActionController: Selection isEmpty:', editor.selection.isEmpty);
    console.log('ActionController: Current document text length:', editor.document.getText().length);

    // 应用建议到编辑器
    const success = await editor.edit(editBuilder => {
      if (editor.selection.isEmpty) {
        // 如果没有选择，替换整个文档
        const fullRange = new vscode.Range(
          editor.document.positionAt(0),
          editor.document.positionAt(editor.document.getText().length)
        );
        console.log('ActionController: Replacing entire document, range:', fullRange);
        editBuilder.replace(fullRange, text);
      } else {
        // 替换选中的文本
        console.log('ActionController: Replacing selected text, selection:', editor.selection);
        editBuilder.replace(editor.selection, text);
      }
    });

    console.log('ActionController: Edit operation success:', success);

    if (!success) {
      throw createError('EDIT_FAILED', 'Failed to apply text changes to editor');
    }

    return { status: 'applied' };
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

    // 同时更新configService
    configService.setConfig({
      apiKey: newConfig.apiKey,
      endpoint: newConfig.endpoint,
      model: newConfig.model,
      timeout: newConfig.timeout,
      maxRetries: newConfig.maxRetries,
    });
  }

  /**
   * 获取AI配置
   */
  private getAIConfig(): AIServiceConfig {
    const config = vscode.workspace.getConfiguration('docmate');

    // 获取基础URL并确保正确的端点
    let endpoint = config.get('aiService.endpoint', '') || config.get('api.baseUrl', '');
    if (!endpoint) {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (endpoint === 'https://api.openai.com/v1') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (!endpoint.includes('/chat/completions')) {
      // 如果是自定义端点但没有包含/chat/completions，添加它
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    return {
      apiKey: config.get('aiService.apiKey', ''),
      endpoint: endpoint,
      model: config.get('api.modelName', 'gpt-3.5-turbo'),
      timeout: 30000,
      maxRetries: 3,
    };
  }
}
