import * as vscode from 'vscode';
import {
  TerminologyService
} from '@docmate/utils';
import {
  AIServiceConfig,
  AIResult,
  ChatMessage,
  ErrorCode,
  CheckRule,
  CheckRuleCommandPayload,
  CheckRuleCommandResult
} from '@docmate/shared';
import { FrontendAIService } from '../services/FrontendAIService';
import { DismissedStateService } from '../services/DismissedStateService';
import { ErrorHandlingService } from '../services/ErrorHandlingService';
import { SmartApplyService } from '../services/SmartApplyService';
import { userConfigService, UserAIConfig } from '../services/UserConfigService';

export class ActionController {
  private terminologyService: TerminologyService;
  private frontendAIService: FrontendAIService | null = null;
  private dismissedStateService: DismissedStateService | null = null;

  constructor() {
    // 初始化服务
    this.terminologyService = new TerminologyService();

    // 初始化配置
    this.updateConfiguration();
  }

  /**
   * 初始化服务
   */
  public async initialize(context?: vscode.ExtensionContext): Promise<void> {
    // 初始化前端AI服务
    await this.initializeFrontendAIService();

    // 初始化DismissedStateService
    if (context) {
      this.dismissedStateService = new DismissedStateService(context);
      // 清理过期的dismissed状态
      await this.dismissedStateService.cleanupExpiredStates();
    }
  }

  /**
   * 初始化前端AI服务
   */
  private async initializeFrontendAIService(): Promise<void> {
    const fullConfig = await userConfigService.getFullAIConfig();

    let aiConfig;
    if (fullConfig && this.isValidUserConfig(fullConfig)) {
      aiConfig = {
        apiKey: fullConfig.apiKey,
        baseUrl: fullConfig.baseUrl,
        model: fullConfig.model,
        timeout: fullConfig.timeout!,
        maxRetries: fullConfig.maxRetries!
      };
    } else {
      const vsCodeConfig = this.getAIConfig();
      const defaultConfig = userConfigService.getDefaultConfig();
      aiConfig = {
        apiKey: vsCodeConfig.apiKey || '',
        baseUrl: vsCodeConfig.endpoint || '',
        model: vsCodeConfig.model || defaultConfig.model,
        timeout: vsCodeConfig.timeout || defaultConfig.timeout!,
        maxRetries: vsCodeConfig.maxRetries || defaultConfig.maxRetries!
      };
    }

    this.frontendAIService = new FrontendAIService(aiConfig);
  }

  /**
   * 验证用户配置是否有效
   */
  private isValidUserConfig(config: any): boolean {
    return !!(
      config &&
      config.apiKey &&
      config.apiKey.trim() &&
      config.baseUrl &&
      config.baseUrl.trim() &&
      config.model &&
      config.model.trim()
    );
  }

  /**
   * 确保AI服务已准备就绪
   */
  private async ensureAIServiceReady(): Promise<void> {
    if (!this.frontendAIService) {
      await this.initializeFrontendAIService();
    }

    if (!this.frontendAIService) {
      throw ErrorHandlingService.createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'Frontend AI service not initialized');
    }

    // 验证配置是否有效
    if (!this.frontendAIService.isConfigValid()) {
      throw ErrorHandlingService.createError(
        ErrorCode.CONFIG_MISSING,
        'AI service is not configured. Please configure API Key, Base URL, and Model in settings.'
      );
    }
  }

  /**
   * 处理命令
   */
  async handle(command: string, payload: any): Promise<any> {
    try {
      let result;
      switch (command) {
        case 'check':
          result = await this.handleCheck(payload);
          break;
        case 'polish':
          result = await this.handlePolish(payload);
          break;
        case 'translate':
        case 'fullTranslate':
          result = await this.handleTranslate({ ...payload, fullDocument: command === 'fullTranslate' });
          break;
        case 'rewrite':
          result = await this.handleRewrite(payload);
          break;
        case 'applySuggestion':
          result = await this.handleApplySuggestion(payload);
          break;
        case 'refresh':
          result = await this.handleRefresh(payload);
          break;
        case 'settings':
        case 'config':
          result = await this.handleConfig(payload);
          break;
        case 'checkRule':
          result = await this.handleCheckRule(payload);
          break;
        case 'cancel':
          result = await this.handleCancel();
          break;
        case 'clearDiagnostics':
          result = await this.handleClearDiagnostics(payload);
          break;
        default:
          throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_COMMAND, `Unknown command: ${command}`);
      }

      return result;
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error);
      ErrorHandlingService.logError(docMateError, `ActionController.executeCommand - ${command}`);
      throw docMateError;
    }
  }

  private getTextFromEditor(text?: string, textSource?: string): { text: string; textSource: string } {
    if (text && text.trim()) {
      return { text, textSource: textSource || 'provided' };
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
    }

    if (!editor.selection.isEmpty) {
      return {
        text: editor.document.getText(editor.selection),
        textSource: 'selected'
      };
    }

    return {
      text: editor.document.getText(),
      textSource: 'full'
    };
  }

  private async handleCheck(payload: any): Promise<AIResult> {
    let { text, textSource, options = {} } = payload;
    const { text: finalText, textSource: finalTextSource } = this.getTextFromEditor(text, textSource);

    if (!finalText || typeof finalText !== 'string' || !finalText.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for check operation');
    }

    await this.ensureAIServiceReady();
    const checkRules = await userConfigService.getCheckRules();
    const result = await this.frontendAIService!.check(finalText, {
      ...options,
      textSource: finalTextSource,
      checkRules
    });

    await this.showV12Diagnostics(result);
    return result;
  }

  private async showV12Diagnostics(result: AIResult): Promise<void> {
    try {
      const { DiagnosticService } = await import('../services/DiagnosticService');
      const editor = vscode.window.activeTextEditor;

      if (editor && result.issues && result.issues.length > 0) {
        const diagnostics = result.issues.map(issue => {
          const startLine = issue.range[0] || 0;
          const endLine = issue.range[1] || startLine;
          let originalText = issue.original_text || '';

          if (!originalText) {
            try {
              originalText = editor.document.lineAt(startLine).text;
            } catch (e) {
              originalText = '';
            }
          }

          return {
            range: {
              start: { line: startLine, character: 0 },
              end: { line: endLine, character: 100 }
            },
            message: issue.message,
            severity: issue.severity,
            source: 'DocMate',
            code: issue.type,
            original_text: originalText,
            suggested_text: issue.suggested_text || '',
            suggestion_type: issue.type
          };
        });

        DiagnosticService.showDiagnostics(editor.document.uri, diagnostics);
      }
    } catch (error) {
      console.error('Failed to show v1.2 diagnostics:', error);
    }
  }

  private async handlePolish(payload: any): Promise<AIResult> {
    let { text, textSource, options = {} } = payload;
    const { text: finalText, textSource: finalTextSource } = this.getTextFromEditor(text, textSource);

    if (!finalText || typeof finalText !== 'string' || !finalText.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for polish operation');
    }

    await this.ensureAIServiceReady();
    return this.frontendAIService!.polish(finalText, { ...options, textSource: finalTextSource });
  }

  private async handleTranslate(payload: any): Promise<AIResult> {
    let { text, textSource, options = {}, fullDocument } = payload;

    if (!options.targetLanguage) {
      throw ErrorHandlingService.createError('MISSING_TARGET_LANGUAGE' as any, 'Target language is required for translation');
    }

    if (fullDocument) {
      text = ''; // 强制使用全文
    }

    const { text: finalText, textSource: finalTextSource } = this.getTextFromEditor(text, textSource);

    if (!finalText || typeof finalText !== 'string' || !finalText.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for translate operation');
    }

    await this.ensureAIServiceReady();
    return this.frontendAIService!.translate(finalText, options);
  }


  private async handleRewrite(payload: any): Promise<AIResult> {
    let { text, textSource, conversationHistory = [], originalText } = payload;
    const instruction = text || payload.instruction || '请改写这段文本，使其更加清晰和简洁';

    if (!instruction || typeof instruction !== 'string') {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, '改写指令不能为空');
    }

    const { text: finalText, textSource: finalTextSource } = this.getTextFromEditor(originalText, textSource);

    if (!finalText || !finalText.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, '没有找到要改写的文本内容');
    }

    await this.ensureAIServiceReady();
    return this.frontendAIService!.rewrite(finalText, instruction, conversationHistory);
  }

  private async handleApplySuggestion(payload: any): Promise<{ status: string; message?: string }> {
    const { text, originalText } = payload;

    if (!text || typeof text !== 'string') {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for apply suggestion operation');
    }

    try {
      const result = await SmartApplyService.applyTextSuggestion(text, originalText);

      if (result.success) {
        await this.clearAllDiagnostics();

        if (this.dismissedStateService && originalText) {
          const editor = vscode.window.activeTextEditor;
          const fileUri = editor?.document.uri.toString();
          await this.dismissedStateService.markDismissed(originalText, fileUri);
        }

        return {
          status: 'applied',
          message: result.message || '已成功应用建议'
        };
      } else {
        throw ErrorHandlingService.createError(
          ErrorCode.ORIGINAL_TEXT_NOT_FOUND,
          result.message || '应用建议失败'
        );
      }
    } catch (error) {
      throw ErrorHandlingService.fromError(error);
    }
  }

  /**
   * 获取已处理状态
   */
  public getDismissedStates(): string[] {
    if (!this.dismissedStateService) {
      return [];
    }
    return this.dismissedStateService.getAllDismissedKeys();
  }

  /**
   * 检查是否已处理
   */
  public isDismissed(originalText: string, fileUri?: string): boolean {
    if (!this.dismissedStateService) {
      return false;
    }
    return this.dismissedStateService.isDismissed(originalText, fileUri);
  }

  private async handleRefresh(_payload: any): Promise<{ status: string }> {
    this.updateConfiguration();
    this.terminologyService = new TerminologyService();
    return { status: 'refreshed' };
  }

  private async handleConfig(payload: any): Promise<any> {
    const { action, config } = payload;

    switch (action) {
      case 'status':
        const status = await userConfigService.getConfigStatus();
        return {
          action: 'status',
          isConfigured: status.isConfigured,
          hasBaseUrl: status.hasBaseUrl,
          hasApiKey: status.hasApiKey,
          hasModel: status.hasModel
        };

      case 'get':
        const currentConfig = await userConfigService.getAIConfig();
        return {
          action: 'get',
          config: currentConfig
        };

      case 'save':
        try {
          await userConfigService.saveAIConfig(config);
          await this.initializeFrontendAIService();
          return {
            action: 'saved',
            success: true,
            isAutoSave: payload.isAutoSave || false
          };
        } catch (error) {
          return {
            action: 'saved',
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }

      case 'test':
        try {
          const fullConfig = await userConfigService.getFullAIConfig();
          const testService = new FrontendAIService({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            timeout: fullConfig.testTimeout!,
            maxRetries: 1
          });
          await testService.callAIService('Hello, this is a test message.');
          return {
            action: 'test',
            success: true,
            message: '连接测试成功！'
          };
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error);
          return {
            action: 'test',
            success: false,
            error: ErrorHandlingService.getFriendlyMessage(docMateError)
          };
        }

      case 'clear':
        await userConfigService.clearConfig();
        await this.initializeFrontendAIService();
        return {
          action: 'cleared',
          success: true
        };

      default:
        throw ErrorHandlingService.createError('INVALID_CONFIG_ACTION' as any, `Unknown config action: ${action}`);
    }
  }

  
  
  /**
   * 更新配置
   */
  updateConfiguration(): void {
    const config = vscode.workspace.getConfiguration('docmate');
    const newConfig = this.getAIConfig();

    // 更新前端AI服务配置
    if (this.frontendAIService) {
      const defaultConfig = userConfigService.getDefaultConfig();
      this.frontendAIService.updateConfig({
        apiKey: newConfig.apiKey,
        baseUrl: newConfig.endpoint,
        model: newConfig.model || defaultConfig.model,
        timeout: newConfig.timeout,
        maxRetries: newConfig.maxRetries
      });
    }
  }

  /**
   * 获取AI配置
   */
  private getAIConfig(): AIServiceConfig {
    const config = vscode.workspace.getConfiguration('docmate');

    // 获取默认配置
    const defaultConfig = userConfigService.getDefaultConfig();

    // 获取基础URL并确保正确的端点
    let endpoint = config.get('aiService.endpoint', '') || config.get('api.baseUrl', '');
    if (!endpoint) {
      endpoint = defaultConfig.baseUrl + '/chat/completions';
    } else if (endpoint === defaultConfig.baseUrl) {
      endpoint = defaultConfig.baseUrl + '/chat/completions';
    } else if (!endpoint.includes('/chat/completions')) {
      // 如果是自定义端点但没有包含/chat/completions，添加它
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    return {
      apiKey: config.get('aiService.apiKey', ''),
      endpoint: endpoint,
      model: config.get('api.modelName', defaultConfig.model),
      timeout: defaultConfig.timeout!,
      maxRetries: defaultConfig.maxRetries!,
    };
  }

  private async handleCancel(): Promise<any> {
    try {
      if (this.frontendAIService) {
        this.frontendAIService.cancelRequest();
      }
      return {
        action: 'cancelled',
        success: true,
        message: '操作已取消'
      };
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.UNKNOWN_ERROR);
      return {
        action: 'cancel',
        success: false,
        error: docMateError.message
      };
    }
  }

  private async clearAllDiagnostics(): Promise<void> {
    try {
      const { DiagnosticService } = await import('../services/DiagnosticService');
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        DiagnosticService.clearDiagnostics(editor.document.uri);
      }
    } catch (error) {
      console.error('Failed to clear diagnostics:', error);
    }
  }

  private async handleClearDiagnostics(payload: any): Promise<any> {
    try {
      const { DiagnosticService } = await import('../services/DiagnosticService');
      const editor = vscode.window.activeTextEditor;

      if (editor) {
        DiagnosticService.clearDiagnostics(editor.document.uri);

        const { originalText } = payload;
        if (this.dismissedStateService && originalText) {
          const fileUri = editor.document.uri.toString();
          const textsToMark = Array.isArray(originalText) ? originalText : [originalText];
          for (const text of textsToMark) {
            if (text) {
              await this.dismissedStateService.markDismissed(text, fileUri);
            }
          }
        }
      }

      return {
        action: 'cleared',
        success: true,
        message: '已清除所有波浪线'
      };
    } catch (error) {
      console.error('Error clearing diagnostics:', error);
      return {
        action: 'cleared',
        success: false,
        message: '清除波浪线失败'
      };
    }
  }

  /**
   * 处理检查规则管理命令
   */
  private async handleCheckRule(payload: any): Promise<CheckRuleCommandResult> {
    const { checkRulePayload } = payload as { checkRulePayload: CheckRuleCommandPayload };

    if (!checkRulePayload) {
      return {
        action: 'getAll',
        success: false,
        error: 'Missing checkRulePayload in payload'
      };
    }

    const { action, rules, ruleIds } = checkRulePayload;

    try {
      switch (action) {
        case 'getAll':
          const allRules = await userConfigService.getCheckRules();
          return {
            action: 'getAll',
            success: true,
            rules: allRules
          };

        case 'update':
          if (!rules || rules.length === 0) {
            return {
              action: 'update',
              success: false,
              error: 'No rules provided for update'
            };
          }
          const updatedRules = await userConfigService.updateCheckRules(rules);
          return {
            action: 'update',
            success: true,
            rules: updatedRules,
            message: '检查规则更新成功'
          };

        case 'create':
          if (!rules || rules.length === 0) {
            return {
              action: 'create',
              success: false,
              error: 'No rules provided for creation'
            };
          }
          const createdRules = await userConfigService.createCheckRules(
            rules as Omit<CheckRule, 'id' | 'createdAt' | 'updatedAt' | 'isDefault'>[]
          );
          return {
            action: 'create',
            success: true,
            rules: createdRules,
            message: '检查规则创建成功'
          };

        case 'delete':
          if (!ruleIds || ruleIds.length === 0) {
            return {
              action: 'delete',
              success: false,
              error: 'No rule IDs provided for deletion'
            };
          }
          const remainingRules = await userConfigService.deleteCheckRules(ruleIds);
          return {
            action: 'delete',
            success: true,
            rules: remainingRules,
            message: '检查规则删除成功'
          };

        default:
          return {
            action: action,
            success: false,
            error: `Unknown check rule action: ${action}`
          };
      }
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error);
      return {
        action: action,
        success: false,
        error: docMateError.message
      };
    }
  }
}
