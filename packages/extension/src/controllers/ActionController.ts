import * as vscode from 'vscode';
import {
  TerminologyService,
  configService
} from '@docmate/utils';
import {
  AIServiceConfig,
  AIResult,
  ChatMessage,
  createError,
  ErrorCode
} from '@docmate/shared';
import { AuthService, AuthStatus } from '../services/AuthService';
import { OAuthService } from '../services/OAuthService';
import { BackendAIService } from '../services/BackendAIService';
import { FrontendAIService } from '../services/FrontendAIService';
import { DismissedStateService } from '../services/DismissedStateService';
import { ErrorHandlingService } from '../services/ErrorHandlingService';
import { SmartApplyService } from '../services/SmartApplyService';
import { userConfigService, UserAIConfig } from '../services/UserConfigService';

export class ActionController {
  private terminologyService: TerminologyService;
  private authService: AuthService | null = null;
  private oauthService: OAuthService | null = null;
  private backendAIService: BackendAIService | null = null;
  private frontendAIService: FrontendAIService | null = null;
  private dismissedStateService: DismissedStateService | null = null;

  constructor() {
    // 初始化服务
    this.terminologyService = new TerminologyService();

    // 初始化configService
    this.updateConfiguration();
  }

  /**
   * 初始化认证服务
   */
  public async initializeAuth(secretStorage: vscode.SecretStorage, context?: vscode.ExtensionContext): Promise<void> {
    this.authService = AuthService.getInstance(secretStorage);
    this.oauthService = OAuthService.getInstance(this.authService);
    this.backendAIService = new BackendAIService(this.authService);

    // 初始化DismissedStateService
    if (context) {
      this.dismissedStateService = new DismissedStateService(context);
      // 清理过期的dismissed状态
      await this.dismissedStateService.cleanupExpiredStates();
    }

    // 初始化前端AI服务
    await this.initializeFrontendAIService();

    await this.authService.initialize();
  }

  /**
   * 初始化前端AI服务
   */
  private async initializeFrontendAIService(): Promise<void> {
    // 获取完整配置（包含默认值）
    const fullConfig = await userConfigService.getFullAIConfig();

    let aiConfig;
    if (fullConfig && this.isValidUserConfig(fullConfig)) {
      // 使用用户配置（已包含默认值）
      aiConfig = {
        apiKey: fullConfig.apiKey,
        baseUrl: fullConfig.baseUrl,
        model: fullConfig.model,
        timeout: fullConfig.timeout!,
        maxRetries: fullConfig.maxRetries!
      };
      console.log('ActionController: Using user config for AI service', {
        timeout: aiConfig.timeout,
        maxRetries: aiConfig.maxRetries
      });
    } else {
      // 回退到VS Code设置 + 默认配置
      const vsCodeConfig = this.getAIConfig();
      const defaultConfig = userConfigService.getDefaultConfig();
      aiConfig = {
        apiKey: vsCodeConfig.apiKey || '',
        baseUrl: vsCodeConfig.endpoint || '',
        model: vsCodeConfig.model || defaultConfig.model,
        timeout: vsCodeConfig.timeout || defaultConfig.timeout!,
        maxRetries: vsCodeConfig.maxRetries || defaultConfig.maxRetries!
      };
      console.log('ActionController: Using VS Code config for AI service', {
        hasApiKey: !!aiConfig.apiKey,
        hasBaseUrl: !!aiConfig.baseUrl,
        model: aiConfig.model,
        timeout: aiConfig.timeout,
        maxRetries: aiConfig.maxRetries
      });
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
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'Frontend AI service not initialized');
    }

    // 验证配置是否有效
    if (!this.frontendAIService.isConfigValid()) {
      throw createError(
        ErrorCode.CONFIG_MISSING,
        'AI service is not configured. Please configure API Key, Base URL, and Model in settings.'
      );
    }
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
        case 'fullTranslate':
          console.log('ActionController: Executing fullTranslate command');
          result = await this.handleTranslate({ ...payload, fullDocument: true });
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
        case 'config':
          console.log('ActionController: Executing config command');
          result = await this.handleConfig(payload);
          break;
        case 'auth':
          console.log('ActionController: Executing auth command');
          result = await this.handleAuth(payload);
          break;
        case 'cancel':
          console.log('ActionController: Executing cancel command');
          result = await this.handleCancel();
          break;
        default:
          throw createError(ErrorCode.UNKNOWN_COMMAND, `Unknown command: ${command}`);
      }

      console.log('ActionController: Command', command, 'completed with result:', result);
      return result;
    } catch (error) {
      console.error('ActionController: Command', command, 'failed with error:', error);
      throw error;
    }
  }

  /**
   * 检查认证状态
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.authService) {
      throw createError('AUTH_NOT_INITIALIZED' as any, 'Authentication service not initialized');
    }

    // 检查是否已认证
    if (this.authService.isAuthenticated()) {
      // 验证Token是否仍然有效
      const isValid = await this.authService.validateToken();
      if (isValid) {
        return true;
      }
    }

    // 需要登录，使用OAuthService
    if (!this.oauthService) {
      throw createError('OAUTH_NOT_INITIALIZED' as any, 'OAuth service not initialized');
    }

    try {
      await this.oauthService.startLogin();
      return this.authService.isAuthenticated();
    } catch (error) {
      console.error('ActionController: Login failed:', error);
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AUTH_FAILED);
      throw createError(docMateError.code as any, `Login failed: ${docMateError.message}`);
    }
  }

  /**
   * 处理检查命令 - 返回新的diff格式
   */
  private async handleCheck(payload: any): Promise<AIResult> {
    let { text, textSource, options = {} } = payload;

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }

      // 检查是否有选择的文本
      if (!editor.selection.isEmpty) {
        text = editor.document.getText(editor.selection);
        textSource = 'selected';
      } else {
        text = editor.document.getText();
        textSource = 'full';
      }
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for check operation');
    }

    // 确保AI服务已准备就绪
    await this.ensureAIServiceReady();

    // 使用前端AI服务，传递文本来源信息
    const result = await this.frontendAIService!.check(text, { ...options, textSource });
    return result;
  }

  /**
   * 处理润色命令 - 返回新的diff格式
   */
  private async handlePolish(payload: any): Promise<AIResult> {
    let { text, textSource, options = {} } = payload;

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }

      // 检查是否有选择的文本
      if (!editor.selection.isEmpty) {
        text = editor.document.getText(editor.selection);
        textSource = 'selected';
      } else {
        text = editor.document.getText();
        textSource = 'full';
      }
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for polish operation');
    }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw ErrorHandlingService.createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'Frontend AI service not initialized');
    }

    console.log('ActionController: Polish - text length:', text.length);
    console.log('ActionController: Polish - textSource:', textSource);

    // 使用前端AI服务，传递文本来源信息
    const result = await this.frontendAIService.polish(text, { ...options, textSource });
    return result;
  }

  /**
   * 处理翻译命令 - 返回新的diff格式
   */
  private async handleTranslate(payload: any): Promise<AIResult> {
    let { text, textSource, options = {}, fullDocument } = payload;

    // 统一文本处理逻辑
    let finalText = text;

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }
      finalText = editor.document.getText();
      textSource = 'full';
    }

    // 兼容旧的fullDocument逻辑
    if (fullDocument && !finalText) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        finalText = editor.document.getText();
      } else {
        throw createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found for full document translation');
      }
    }

    if (!finalText || typeof finalText !== 'string' || !finalText.trim()) {
      throw createError(ErrorCode.INVALID_TEXT, 'Text is required for translate operation');
    }

    if (!options.targetLanguage) {
      throw createError('MISSING_TARGET_LANGUAGE' as any, 'Target language is required for translation');
    }

    // 检查认证状态 - 暂时移除认证要求
    // const isAuthenticated = await this.ensureAuthenticated();
    // if (!isAuthenticated) {
    //   throw createError('AUTH_REQUIRED', 'Authentication required for AI operations');
    // }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'Frontend AI service not initialized');
    }

    // 根据文本来源决定处理方式
    // 统一调用translate服务
    const result = await this.frontendAIService.translate(finalText, options);

    return result;
  }


  /**
   * 处理改写命令
   */
  private async handleRewrite(payload: any): Promise<AIResult> {
    let { text, textSource, conversationHistory = [], originalText } = payload;

    // text是改写指令，originalText是要改写的文本
    const instruction = text || payload.instruction || '请改写这段文本，使其更加清晰和简洁';

    if (!instruction || typeof instruction !== 'string') {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, '改写指令不能为空');
    }

    // 如果没有传入原始文本，自动获取全文
    if (!originalText || !originalText.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }

      // 检查是否有选择的文本
      if (!editor.selection.isEmpty) {
        originalText = editor.document.getText(editor.selection);
        textSource = 'selected';
      } else {
        originalText = editor.document.getText();
        textSource = 'full';
      }
    }

    if (!originalText || !originalText.trim()) {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, '没有找到要改写的文本内容');
    }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw ErrorHandlingService.createError(ErrorCode.SERVICE_NOT_INITIALIZED, 'Frontend AI service not initialized');
    }

    console.log('ActionController: Rewrite - instruction:', instruction);
    console.log('ActionController: Rewrite - originalText length:', originalText.length);
    console.log('ActionController: Rewrite - textSource:', textSource);

    const result = await this.frontendAIService.rewrite(originalText, instruction, conversationHistory);

    return result;
  }

  /**
   * 处理应用建议命令
   */
  private async handleApplySuggestion(payload: any): Promise<{ status: string; message?: string }> {
    const { text, originalText } = payload;
    console.log('ActionController: handleApplySuggestion called with text:', text);
    console.log('ActionController: originalText:', originalText);

    if (!text || typeof text !== 'string') {
      throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Text is required for apply suggestion operation');
    }

    try {
      // 使用SmartApplyService进行智能应用
      const result = await SmartApplyService.applyTextSuggestion(text, originalText);

      if (result.success) {
        // 应用成功，标记为已处理
        if (this.dismissedStateService && originalText) {
          const editor = vscode.window.activeTextEditor;
          const fileUri = editor?.document.uri.toString();
          await this.dismissedStateService.markDismissed(originalText, fileUri);
          console.log('ActionController: Marked suggestion as dismissed');
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
      console.error('ActionController: Apply suggestion failed:', error);

      // 转换为友好错误
      const friendlyError = ErrorHandlingService.fromError(error);
      throw friendlyError;
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

  /**
   * 处理刷新命令
   */
  private async handleRefresh(_payload: any): Promise<{ status: string }> {
    // 重新加载配置
    this.updateConfiguration();

    // 重新加载术语库
    this.terminologyService = new TerminologyService();

    return { status: 'refreshed' };
  }

  /**
   * 处理配置命令
   */
  private async handleConfig(payload: any): Promise<any> {
    const { action, config } = payload;

    switch (action) {
      case 'status':
        // 检查配置状态
        console.log('ActionController: Checking config status');
        const status = await userConfigService.getConfigStatus();
        const result = {
          action: 'status',
          isConfigured: status.isConfigured,
          hasBaseUrl: status.hasBaseUrl,
          hasApiKey: status.hasApiKey,
          hasModel: status.hasModel
        };
        console.log('ActionController: Config status result:', result);
        return result;

      case 'get':
        // 获取当前配置
        const currentConfig = await userConfigService.getAIConfig();
        return {
          action: 'get',
          config: currentConfig
        };

      case 'save':
        // 保存配置
        try {
          await userConfigService.saveAIConfig(config);

          // 重新初始化前端AI服务
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
        // 测试连接
        try {
          // 获取完整配置（包含默认值）
          const fullConfig = await userConfigService.getFullAIConfig();

          // 创建临时的AI服务实例来测试连接
          const testService = new FrontendAIService({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            timeout: fullConfig.testTimeout!,
            maxRetries: 1
          });

          // 发送一个简单的测试请求
          await testService.callAIService('Hello, this is a test message.');

          return {
            action: 'test',
            success: true,
            message: '连接测试成功！'
          };
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
          return {
            action: 'test',
            success: false,
            error: docMateError.message
          };
        }

      case 'clear':
        // 清除配置
        await userConfigService.clearConfig();

        // 重新初始化前端AI服务
        await this.initializeFrontendAIService();

        return {
          action: 'cleared',
          success: true
        };

      default:
        throw createError('INVALID_CONFIG_ACTION' as any, `Unknown config action: ${action}`);
    }
  }

  /**
   * 处理认证命令
   */
  private async handleAuth(payload: any): Promise<any> {
    if (!this.authService || !this.oauthService) {
      throw createError('AUTH_NOT_INITIALIZED' as any, 'Authentication service not initialized');
    }

    const { action, data } = payload;

    switch (action) {
      case 'status':
        return {
          isAuthenticated: this.authService.isAuthenticated(),
          status: this.authService.getStatus(),
          userInfo: this.authService.getUserInfo()
        };

      case 'login':
        try {
          await this.oauthService.startLogin();

          if (this.authService.isAuthenticated()) {
            const userInfo = this.authService.getUserInfo();
            return {
              success: true,
              isAuthenticated: true,
              status: 'authenticated',
              userInfo: userInfo
            };
          } else {
            return {
              success: false,
              isAuthenticated: false,
              status: 'not_authenticated',
              userInfo: null
            };
          }
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AUTH_FAILED);
          throw createError(docMateError.code as any, `Login failed: ${docMateError.message}`);
        }

      case 'logout':
        try {
          await this.authService.logout();
          return {
            success: true,
            message: '已成功登出'
          };
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error, 'LOGOUT_FAILED' as any);
          throw createError(docMateError.code as any, `Logout failed: ${docMateError.message}`);
        }

      case 'showStatus':
        const isAuthenticated = this.authService.isAuthenticated();
        const userInfo = this.authService.getUserInfo();

        if (isAuthenticated && userInfo) {
          vscode.window.showInformationMessage(
            `当前用户: ${userInfo.username}\n邮箱: ${userInfo.email}\n状态: 已登录`
          );
        } else {
          vscode.window.showInformationMessage('当前未登录DocMate');
        }
        return { status: 'shown' };

      case 'showNotImplemented':
        vscode.window.showInformationMessage(
          '登录功能暂未实现，请在配置中填写您的AI服务信息',
          '立即登录'
        ).then(selection => {
          if (selection === '立即登录') {
            vscode.window.showInformationMessage(
              '您可以在插件配置中设置OpenAI兼容的API服务，包括基础URL、API密钥和模型名称。'
            );
          }
        });
        return { status: 'shown' };

      case 'loginWithToken':
        // 兼容旧的token登录方式
        if (!data || !data.token) {
          throw createError('INVALID_PAYLOAD' as any, 'Token is required for login');
        }
        try {
          const authResponse = await this.authService.loginWithSSOToken(data.token);
          return {
            success: true,
            userInfo: authResponse.user_info
          };
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AUTH_FAILED);
          throw createError(docMateError.code as any, `Login failed: ${docMateError.message}`);
        }

      case 'loginWithCredentials':
        // 新的双重认证登录方式
        if (!data || !data.sessionCookie) {
          throw createError('INVALID_PAYLOAD' as any, 'Session cookie is required for login');
        }
        try {
          const authResponse = await this.authService.loginWithSSOCredentials(
            data.sessionCookie,
            data.token
          );
          return {
            success: true,
            userInfo: authResponse.user_info
          };
        } catch (error) {
          const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AUTH_FAILED);
          throw createError(docMateError.code as any, `Login failed: ${docMateError.message}`);
        }

      default:
        throw createError('UNKNOWN_AUTH_ACTION' as any, `Unknown auth action: ${action}`);
    }
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
        throw createError('UNKNOWN_SETTINGS_ACTION' as any, `Unknown settings action: ${action}`);
    }
  }

  /**
   * 获取设置
   */
  private getSettings(): any {
    const config = vscode.workspace.getConfiguration('docmate');

    return {
      backend: {
        baseUrl: config.get('backend.baseUrl', 'http://localhost:8000'),
      },
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
        hasBackendUrl: !!config.get('backend.baseUrl', ''),
      }
    };
  }

  /**
   * 更新设置
   */
  private async updateSettings(data: any): Promise<{ status: string }> {
    const config = vscode.workspace.getConfiguration('docmate');

    try {
      if (data.backend) {
        if (data.backend.baseUrl !== undefined) {
          await config.update('backend.baseUrl', data.backend.baseUrl, vscode.ConfigurationTarget.Global);
        }
      }

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
      const docMateError = ErrorHandlingService.fromError(error, 'SETTINGS_UPDATE_FAILED' as any);
      throw createError(docMateError.code as any, 'Failed to update settings', { originalError: error });
    }
  }

  /**
   * 验证设置
   */
  private validateSettings(): any {
    return {
      terminology: {
        isLoaded: !!this.terminologyService.getDatabase(),
      }
    };
  }

  /**
   * 更新配置
   */
  updateConfiguration(): void {
    const config = vscode.workspace.getConfiguration('docmate');
    const backendBaseUrl = config.get('backend.baseUrl', 'http://localhost:8000');

    const newConfig = this.getAIConfig();

    // 同时更新configService
    configService.setConfig({
      apiKey: newConfig.apiKey,
      endpoint: newConfig.endpoint,
      model: newConfig.model,
      timeout: newConfig.timeout,
      maxRetries: newConfig.maxRetries,
    });

    // 设置后端基础URL
    configService.setBackendBaseUrl(backendBaseUrl);

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

  /**
   * 处理取消命令
   */
  private async handleCancel(): Promise<any> {
    console.log('ActionController: Handling cancel command');

    try {
      // 取消前端AI服务的当前请求
      if (this.frontendAIService) {
        this.frontendAIService.cancelRequest();
      }

      return {
        action: 'cancelled',
        success: true,
        message: '操作已取消'
      };
    } catch (error) {
      console.error('ActionController: Cancel failed:', error);
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.UNKNOWN_ERROR);
      return {
        action: 'cancel',
        success: false,
        error: docMateError.message
      };
    }
  }
}
