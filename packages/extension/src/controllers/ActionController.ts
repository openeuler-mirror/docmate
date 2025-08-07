import * as vscode from 'vscode';
import {
  TerminologyService,
  configService
} from '@docmate/utils';
import {
  AIServiceConfig,
  CheckResult,
  PolishResult,
  TranslateResult,
  FullTranslateResult,
  RewriteResult,
  ChatMessage,
  createError
} from '@docmate/shared';
import { AuthService, AuthStatus } from '../services/AuthService';
import { OAuthService } from '../services/OAuthService';
import { BackendAIService } from '../services/BackendAIService';
import { FrontendAIService } from '../services/FrontendAIService';
import { userConfigService, UserAIConfig } from '../services/UserConfigService';

export class ActionController {
  private terminologyService: TerminologyService;
  private authService: AuthService | null = null;
  private oauthService: OAuthService | null = null;
  private backendAIService: BackendAIService | null = null;
  private frontendAIService: FrontendAIService | null = null;

  constructor() {
    // 初始化服务
    this.terminologyService = new TerminologyService();

    // 初始化configService
    this.updateConfiguration();
  }

  /**
   * 初始化认证服务
   */
  public async initializeAuth(secretStorage: vscode.SecretStorage): Promise<void> {
    this.authService = AuthService.getInstance(secretStorage);
    this.oauthService = OAuthService.getInstance(this.authService);
    this.backendAIService = new BackendAIService(this.authService);

    // 初始化前端AI服务
    await this.initializeFrontendAIService();

    await this.authService.initialize();
  }

  /**
   * 初始化前端AI服务
   */
  private async initializeFrontendAIService(): Promise<void> {
    // 首先尝试从用户配置服务获取配置
    const userConfig = await userConfigService.getAIConfig();

    let aiConfig;
    if (userConfig) {
      // 使用用户配置
      aiConfig = {
        apiKey: userConfig.apiKey,
        baseUrl: userConfig.baseUrl,
        model: userConfig.model,
        timeout: 30000,
        maxRetries: 3
      };
    } else {
      // 回退到VS Code设置
      const vsCodeConfig = this.getAIConfig();
      aiConfig = {
        apiKey: vsCodeConfig.apiKey,
        baseUrl: vsCodeConfig.endpoint,
        model: vsCodeConfig.model || 'gpt-3.5-turbo',
        timeout: vsCodeConfig.timeout || 30000,
        maxRetries: vsCodeConfig.maxRetries || 3
      };
    }

    this.frontendAIService = new FrontendAIService(aiConfig);
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
   * 检查认证状态
   */
  private async ensureAuthenticated(): Promise<boolean> {
    if (!this.authService) {
      throw createError('AUTH_NOT_INITIALIZED', 'Authentication service not initialized');
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
      throw createError('OAUTH_NOT_INITIALIZED', 'OAuth service not initialized');
    }

    try {
      await this.oauthService.startLogin();
      return this.authService.isAuthenticated();
    } catch (error) {
      console.error('ActionController: Login failed:', error);
      return false;
    }
  }

  /**
   * 处理检查命令 - 返回新的diff格式
   */
  private async handleCheck(payload: any): Promise<CheckResult> {
    let { text, textSource, options = {} } = payload;

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError('NO_ACTIVE_EDITOR', 'No active editor found');
      }
      text = editor.document.getText();
      textSource = 'full';
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw createError('INVALID_TEXT', 'Text is required for check operation');
    }

    // 检查认证状态 - 暂时移除认证要求
    // const isAuthenticated = await this.ensureAuthenticated();
    // if (!isAuthenticated) {
    //   throw createError('AUTH_REQUIRED', 'Authentication required for AI operations');
    // }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw createError('FRONTEND_AI_SERVICE_NOT_INITIALIZED', 'Frontend AI service not initialized');
    }

    // 使用前端AI服务，传递文本来源信息
    const result = await this.frontendAIService.check(text, { ...options, textSource });
    return {
      ...result,
      textSource
    };
  }

  /**
   * 处理润色命令 - 返回新的diff格式
   */
  private async handlePolish(payload: any): Promise<PolishResult> {
    let { text, textSource, options = {} } = payload;

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError('NO_ACTIVE_EDITOR', 'No active editor found');
      }
      text = editor.document.getText();
      textSource = 'full';
    }

    if (!text || typeof text !== 'string' || !text.trim()) {
      throw createError('INVALID_TEXT', 'Text is required for polish operation');
    }

    // 检查认证状态 - 暂时移除认证要求
    // const isAuthenticated = await this.ensureAuthenticated();
    // if (!isAuthenticated) {
    //   throw createError('AUTH_REQUIRED', 'Authentication required for AI operations');
    // }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw createError('FRONTEND_AI_SERVICE_NOT_INITIALIZED', 'Frontend AI service not initialized');
    }

    // 使用前端AI服务，传递文本来源信息
    const result = await this.frontendAIService.polish(text, { ...options, textSource });
    return {
      ...result,
      textSource
    };
  }

  /**
   * 处理翻译命令 - 返回新的diff格式
   */
  private async handleTranslate(payload: any): Promise<TranslateResult | FullTranslateResult> {
    let { text, textSource, options = {}, fullDocument } = payload;

    // 统一文本处理逻辑
    let finalText = text;
    let isFullDocument = fullDocument || textSource === 'full';

    // 如果没有传入文本，自动获取全文
    if (!text || !text.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError('NO_ACTIVE_EDITOR', 'No active editor found');
      }
      finalText = editor.document.getText();
      textSource = 'full';
      isFullDocument = true;
    }

    // 兼容旧的fullDocument逻辑
    if (fullDocument && !finalText) {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        finalText = editor.document.getText();
        isFullDocument = true;
      } else {
        throw createError('NO_ACTIVE_EDITOR', 'No active editor found for full document translation');
      }
    }

    if (!finalText || typeof finalText !== 'string' || !finalText.trim()) {
      throw createError('INVALID_TEXT', 'Text is required for translate operation');
    }

    if (!options.targetLanguage) {
      throw createError('MISSING_TARGET_LANGUAGE', 'Target language is required for translation');
    }

    // 检查认证状态 - 暂时移除认证要求
    // const isAuthenticated = await this.ensureAuthenticated();
    // if (!isAuthenticated) {
    //   throw createError('AUTH_REQUIRED', 'Authentication required for AI operations');
    // }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw createError('FRONTEND_AI_SERVICE_NOT_INITIALIZED', 'Frontend AI service not initialized');
    }

    // 根据文本来源决定处理方式
    if (isFullDocument) {
      // 全文翻译，返回FullTranslateResult
      const result = await this.frontendAIService.translate(finalText, options);
      // 从diffs中提取翻译后的文本
      let translatedText = finalText;
      if (result.diffs.length > 0) {
        // 查找insert类型的diff，这包含翻译后的文本
        const insertDiff = result.diffs.find(diff => diff.type === 'insert');
        if (insertDiff) {
          translatedText = insertDiff.value;
        }
      }

      return {
        translatedText: translatedText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        isFullDocument: true,
        textSource: textSource || 'full'
      } as FullTranslateResult;
    } else {
      // 选中文本翻译，返回TranslateResult
      return await this.frontendAIService.translate(finalText, options);
    }
  }


  /**
   * 处理改写命令
   */
  private async handleRewrite(payload: any): Promise<RewriteResult> {
    let { text, textSource, conversationHistory = [], originalText } = payload;

    if (!text || typeof text !== 'string') {
      throw createError('INVALID_TEXT', 'Text is required for rewrite operation');
    }

    // 如果没有传入原始文本，自动获取全文
    if (!originalText || !originalText.trim()) {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError('NO_ACTIVE_EDITOR', 'No active editor found');
      }
      originalText = editor.document.getText();
      textSource = 'full';
    }

    // 检查认证状态 - 暂时移除认证要求
    // const isAuthenticated = await this.ensureAuthenticated();
    // if (!isAuthenticated) {
    //   throw createError('AUTH_REQUIRED', 'Authentication required for AI operations');
    // }

    // 使用前端AI服务
    if (!this.frontendAIService) {
      throw createError('FRONTEND_AI_SERVICE_NOT_INITIALIZED', 'Frontend AI service not initialized');
    }

    // 从payload中提取用户的改写指令
    const instruction = payload.text || payload.instruction || '请改写这段文本，使其更加清晰和简洁';
    const textToRewrite = originalText || text;

    const result = await this.frontendAIService.rewrite(textToRewrite, instruction, conversationHistory);

    return {
      ...result,
      textSource
    };
  }

  /**
   * 处理应用建议命令
   */
  private async handleApplySuggestion(payload: any): Promise<{ status: string }> {
    const { text, originalText } = payload;
    console.log('ActionController: handleApplySuggestion called with text:', text);
    console.log('ActionController: originalText:', originalText);

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

    // 应用建议到编辑器
    const success = await editor.edit(editBuilder => {
      if (editor.selection.isEmpty) {
        // 如果没有选择文本，尝试在文档中查找原文并替换
        if (originalText) {
          const documentText = editor.document.getText();
          const originalIndex = documentText.indexOf(originalText);

          if (originalIndex !== -1) {
            // 找到原文，只替换这部分
            const startPos = editor.document.positionAt(originalIndex);
            const endPos = editor.document.positionAt(originalIndex + originalText.length);
            const range = new vscode.Range(startPos, endPos);
            console.log('ActionController: Replacing found original text, range:', range);
            editBuilder.replace(range, text);
          } else {
            // 找不到原文，提示用户选择文本
            console.warn('ActionController: Original text not found in document');
            throw createError('ORIGINAL_TEXT_NOT_FOUND', '无法找到原文，请选择要修改的文本');
          }
        } else {
          // 没有原文信息，提示用户选择文本
          throw createError('NO_SELECTION_NO_ORIGINAL', '请选择要修改的文本，或确保提供了原文信息');
        }
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
            success: true
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
          // 创建临时的AI服务实例来测试连接
          const testService = new FrontendAIService({
            apiKey: config.apiKey,
            baseUrl: config.baseUrl,
            model: config.model,
            timeout: 10000,
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
          return {
            action: 'test',
            success: false,
            error: error instanceof Error ? error.message : 'Connection test failed'
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
        throw createError('INVALID_CONFIG_ACTION', `Unknown config action: ${action}`);
    }
  }

  /**
   * 处理认证命令
   */
  private async handleAuth(payload: any): Promise<any> {
    if (!this.authService || !this.oauthService) {
      throw createError('AUTH_NOT_INITIALIZED', 'Authentication service not initialized');
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
          throw createError('AUTH_FAILED', `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

      case 'logout':
        try {
          await this.authService.logout();
          return {
            success: true,
            message: '已成功登出'
          };
        } catch (error) {
          throw createError('LOGOUT_FAILED', `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          throw createError('INVALID_PAYLOAD', 'Token is required for login');
        }
        try {
          const authResponse = await this.authService.loginWithSSOToken(data.token);
          return {
            success: true,
            userInfo: authResponse.user_info
          };
        } catch (error) {
          throw createError('AUTH_FAILED', `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

      case 'loginWithCredentials':
        // 新的双重认证登录方式
        if (!data || !data.sessionCookie) {
          throw createError('INVALID_PAYLOAD', 'Session cookie is required for login');
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
          throw createError('AUTH_FAILED', `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }

      default:
        throw createError('UNKNOWN_AUTH_ACTION', `Unknown auth action: ${action}`);
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
        throw createError('UNKNOWN_SETTINGS_ACTION', `Unknown settings action: ${action}`);
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
      throw createError('SETTINGS_UPDATE_FAILED', 'Failed to update settings', { originalError: error });
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
      this.frontendAIService.updateConfig({
        apiKey: newConfig.apiKey,
        baseUrl: newConfig.endpoint,
        model: newConfig.model || 'gpt-3.5-turbo',
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
