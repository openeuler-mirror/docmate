import * as vscode from 'vscode';
import { AuthService } from './AuthService';

/**
 * OAuth认证服务
 * 处理openEuler SSO的OAuth回调流程
 */
export class OAuthService implements vscode.UriHandler {
  private static instance: OAuthService;
  private authService: AuthService;
  private pendingAuth: Promise<void> | null = null;
  private authResolve: ((value: void | PromiseLike<void>) => void) | null = null;
  private authReject: ((reason?: any) => void) | null = null;

  private constructor(authService: AuthService) {
    this.authService = authService;
  }

  public static getInstance(authService: AuthService): OAuthService {
    if (!OAuthService.instance) {
      OAuthService.instance = new OAuthService(authService);
    }
    return OAuthService.instance;
  }

  /**
   * 处理URI回调
   */
  public handleUri(uri: vscode.Uri): vscode.ProviderResult<void> {
    console.log('OAuthService: Received URI callback:', uri.toString());

    try {
      // 解析URI参数
      const query = new URLSearchParams(uri.query);
      const fragment = new URLSearchParams(uri.fragment);
      
      // 尝试从query或fragment中提取Cookie信息
      const sessionCookie = query.get('session_cookie') || 
                           fragment.get('session_cookie') || 
                           query.get('_Y_G_') || 
                           fragment.get('_Y_G_');
                           
      const token = query.get('token') || 
                   fragment.get('token') || 
                   query.get('_U_T_') || 
                   fragment.get('_U_T_');

      if (sessionCookie) {
        this.handleAuthSuccess(sessionCookie, token || undefined);
      } else {
        // 如果没有直接的参数，尝试从完整URI中提取
        this.handleAuthCallback(uri);
      }
    } catch (error) {
      console.error('OAuthService: Error handling URI:', error);
      this.handleAuthError(error);
    }
  }

  /**
   * 启动OAuth登录流程
   */
  public async startLogin(): Promise<void> {
    try {
      // 如果已有进行中的认证，等待完成
      if (this.pendingAuth) {
        return this.pendingAuth;
      }

      // 创建新的认证Promise
      this.pendingAuth = new Promise<void>((resolve, reject) => {
        this.authResolve = resolve;
        this.authReject = reject;
      });

      // 获取登录URL
      const loginUrl = await this.authService.getLoginUrl();
      
      // 构建带回调的登录URL
      const callbackUri = this.getCallbackUri();
      const fullLoginUrl = `${loginUrl}?redirect_uri=${encodeURIComponent(callbackUri)}`;

      console.log('OAuthService: Opening login URL:', fullLoginUrl);

      // 在外部浏览器中打开登录页面
      await vscode.env.openExternal(vscode.Uri.parse(fullLoginUrl));

      // 显示等待消息，允许用户取消
      const result = await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '等待openEuler登录完成...',
        cancellable: true
      }, async (progress, token) => {
        progress.report({
          increment: 0,
          message: '请在浏览器中完成登录，登录完成后将自动返回VSCode'
        });

        return new Promise<void>((resolve, reject) => {
          // 监听取消事件
          token.onCancellationRequested(() => {
            this.clearPendingAuth();
            reject(new Error('User cancelled login'));
          });

          // 保存原始的resolve和reject，以便在回调中使用
          const originalResolve = this.authResolve;
          const originalReject = this.authReject;

          this.authResolve = () => {
            progress.report({ increment: 100, message: '登录成功！' });
            resolve();
          };

          this.authReject = (error) => {
            reject(error);
          };

          // 设置超时（5分钟）
          setTimeout(() => {
            if (this.pendingAuth) {
              this.clearPendingAuth();
              reject(new Error('Login timeout'));
            }
          }, 300000);
        });
      });

      return result;

    } catch (error) {
      console.error('OAuthService: Login failed:', error);

      // 询问用户是否要手动输入
      const errorMessage = error instanceof Error ? error.message : '登录失败';
      const fallback = await vscode.window.showErrorMessage(
        `自动登录失败: ${errorMessage}\n\n是否尝试手动输入Cookie？`,
        '手动输入',
        '取消'
      );

      if (fallback === '手动输入') {
        await this.promptForManualInput();
        return;
      }

      this.handleAuthError(error);
      throw error;
    }
  }

  /**
   * 获取回调URI
   */
  private getCallbackUri(): string {
    // 使用VSCode的URI scheme
    return `vscode://openeuler.docmate/auth-callback`;
  }

  /**
   * 处理认证成功
   */
  private async handleAuthSuccess(sessionCookie: string, token?: string): Promise<void> {
    try {
      console.log('OAuthService: Authentication successful');
      
      // 调用AuthService进行登录
      await this.authService.loginWithSSOCredentials(sessionCookie, token);
      
      // 显示成功消息
      vscode.window.showInformationMessage('登录成功！');
      
      // 解决认证Promise
      if (this.authResolve) {
        this.authResolve();
      }
    } catch (error) {
      console.error('OAuthService: Login with credentials failed:', error);
      this.handleAuthError(error);
    } finally {
      this.clearPendingAuth();
    }
  }

  /**
   * 处理认证错误
   */
  private handleAuthError(error: any): void {
    console.error('OAuthService: Authentication error:', error);
    
    const errorMessage = error instanceof Error ? error.message : '登录失败';
    vscode.window.showErrorMessage(`登录失败: ${errorMessage}`);
    
    if (this.authReject) {
      this.authReject(error);
    }
    
    this.clearPendingAuth();
  }

  /**
   * 处理认证回调（当没有直接参数时）
   */
  private handleAuthCallback(uri: vscode.Uri): void {
    // 这里可以添加更复杂的Cookie提取逻辑
    // 比如解析完整的URI或者使用其他方式获取Cookie
    
    console.log('OAuthService: Processing auth callback:', uri.toString());
    
    // 暂时显示需要手动输入的消息
    this.promptForManualInput();
  }

  /**
   * 提示用户手动输入Cookie
   */
  private async promptForManualInput(): Promise<void> {
    try {
      // 首先显示详细的操作指导
      const proceed = await vscode.window.showInformationMessage(
        '手动获取Cookie步骤：\n\n' +
        '1. 在浏览器中访问 https://id.openeuler.org/login\n' +
        '2. 完成登录\n' +
        '3. 按F12打开开发者工具\n' +
        '4. 切换到"应用程序"(Application)标签\n' +
        '5. 在左侧展开"Cookie"\n' +
        '6. 找到_Y_G_和_U_T_的值\n\n' +
        '准备好后点击"输入Cookie"',
        { modal: true },
        '输入Cookie',
        '打开登录页面',
        '取消'
      );

      if (proceed === '打开登录页面') {
        // 打开登录页面
        await vscode.env.openExternal(vscode.Uri.parse('https://id.openeuler.org/login'));

        // 再次询问是否准备输入
        const ready = await vscode.window.showInformationMessage(
          '登录页面已打开，完成登录后请按照上述步骤获取Cookie',
          { modal: true },
          '输入Cookie',
          '取消'
        );

        if (ready !== '输入Cookie') {
          throw new Error('用户取消手动输入');
        }
      } else if (proceed !== '输入Cookie') {
        throw new Error('用户取消手动输入');
      }

      // 输入_Y_G_ Cookie
      const sessionCookie = await vscode.window.showInputBox({
        prompt: '请输入_Y_G_ Cookie的值',
        placeHolder: '例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return '请输入_Y_G_ Cookie值';
          }
          if (value.length < 10) {
            return 'Cookie值似乎太短，请检查是否完整';
          }
          return null;
        }
      });

      if (!sessionCookie) {
        throw new Error('未提供会话Cookie');
      }

      // 输入_U_T_ Token（可选）
      const token = await vscode.window.showInputBox({
        prompt: '请输入_U_T_ Token的值（可选，如果没有可以留空）',
        placeHolder: '例如: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        ignoreFocusOut: true
      });

      // 显示登录进度
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在验证登录信息...',
        cancellable: false
      }, async (progress) => {
        progress.report({ increment: 0, message: '验证Cookie...' });

        await this.handleAuthSuccess(sessionCookie.trim(), token?.trim() || undefined);

        progress.report({ increment: 100, message: '登录成功！' });
      });

    } catch (error) {
      console.error('OAuthService: Manual input failed:', error);

      if (error instanceof Error && error.message.includes('取消')) {
        // 用户主动取消，不显示错误
        this.clearPendingAuth();
      } else {
        // 其他错误，询问是否重试
        const retry = await vscode.window.showErrorMessage(
          `手动登录失败: ${error instanceof Error ? error.message : '未知错误'}`,
          '重试',
          '取消'
        );

        if (retry === '重试') {
          await this.promptForManualInput();
        } else {
          this.handleAuthError(error);
        }
      }
    }
  }

  /**
   * 清除待处理的认证
   */
  private clearPendingAuth(): void {
    this.pendingAuth = null;
    this.authResolve = null;
    this.authReject = null;
  }

  /**
   * 取消当前认证
   */
  public cancelAuth(): void {
    if (this.pendingAuth) {
      this.handleAuthError(new Error('用户取消登录'));
    }
  }
}
