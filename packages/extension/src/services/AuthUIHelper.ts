import * as vscode from 'vscode';
import { AuthService } from './AuthService';

/**
 * 认证UI辅助类
 * 提供用户友好的认证界面
 */
export class AuthUIHelper {
  private authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  /**
   * 显示登录对话框
   */
  public async showLoginDialog(): Promise<any> {
    try {
      // 获取登录URL
      const loginUrl = await this.authService.getLoginUrl();
      
      // 显示登录说明
      const action = await vscode.window.showInformationMessage(
        'DocMate需要openEuler账户认证才能使用AI功能',
        {
          modal: true,
          detail: `请按以下步骤完成登录：\n\n1. 点击"打开登录页面"访问openEuler登录页面\n2. 使用您的openEuler账户登录\n3. 登录成功后，在浏览器开发者工具中找到Cookie中的_U_T_值\n4. 点击"输入Token"并粘贴该值`
        },
        '打开登录页面',
        '输入Token',
        '取消'
      );

      switch (action) {
        case '打开登录页面':
          // 打开登录页面
          await vscode.env.openExternal(vscode.Uri.parse(loginUrl));
          // 继续显示输入对话框
          return await this.showTokenInputDialog();
          
        case '输入Token':
          return await this.showTokenInputDialog();
          
        default:
          return {
            success: false,
            isAuthenticated: false,
            status: 'not_authenticated',
            userInfo: null
          };
      }
    } catch (error) {
      vscode.window.showErrorMessage(`登录失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return {
        success: false,
        isAuthenticated: false,
        status: 'not_authenticated',
        userInfo: null
      };
    }
  }

  /**
   * 显示Token输入对话框
   */
  private async showTokenInputDialog(): Promise<any> {
    try {
      const token = await vscode.window.showInputBox({
        prompt: '请输入从openEuler Cookie中获取的_U_T_值',
        placeHolder: '...',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (!value || value.trim().length === 0) {
            return 'Token不能为空';
          }
          if (value.length < 10) {
            return 'Token格式不正确';
          }
          return null;
        }
      });

      if (!token) {
        return {
          success: false,
          isAuthenticated: false,
          status: 'not_authenticated',
          userInfo: null
        };
      }

      // 显示登录进度
      return await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在登录...',
        cancellable: false
      }, async (progress) => {
        try {
          progress.report({ increment: 30, message: '验证Token...' });
          
          const authResponse = await this.authService.loginWithSSOToken(token.trim());
          
          progress.report({ increment: 70, message: '登录成功' });
          
          // 显示成功消息
          vscode.window.showInformationMessage(
            `欢迎，${authResponse.user_info.username}！DocMate已准备就绪。`
          );

          // 返回最新的认证状态
          return {
            success: true,
            isAuthenticated: this.authService.isAuthenticated(),
            status: this.authService.getStatus(),
            userInfo: this.authService.getUserInfo()
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '登录失败';
          vscode.window.showErrorMessage(`登录失败: ${errorMessage}`);
          
          // 询问是否重试
          const retry = await vscode.window.showErrorMessage(
            '登录失败，是否重试？',
            '重试',
            '取消'
          );
          
          if (retry === '重试') {
            return await this.showTokenInputDialog();
          }

          return {
            success: false,
            isAuthenticated: false,
            status: 'not_authenticated',
            userInfo: null
          };
        }
      });
    } catch (error) {
      vscode.window.showErrorMessage(`输入错误: ${error instanceof Error ? error.message : '未知错误'}`);
      return {
        success: false,
        isAuthenticated: false,
        status: 'not_authenticated',
        userInfo: null
      };
    }
  }

  /**
   * 显示登出确认对话框
   */
  public async showLogoutDialog(): Promise<boolean> {
    const action = await vscode.window.showWarningMessage(
      '确定要登出DocMate吗？',
      {
        modal: true,
        detail: '登出后将无法使用AI功能，直到重新登录。'
      },
      '登出',
      '取消'
    );

    if (action === '登出') {
      try {
        await this.authService.logout();
        vscode.window.showInformationMessage('已成功登出DocMate');
        return true;
      } catch (error) {
        vscode.window.showErrorMessage(`登出失败: ${error instanceof Error ? error.message : '未知错误'}`);
        return false;
      }
    }

    return false;
  }

  /**
   * 显示认证状态信息
   */
  public async showAuthStatus(): Promise<void> {
    const isAuthenticated = this.authService.isAuthenticated();
    const userInfo = this.authService.getUserInfo();

    if (isAuthenticated && userInfo) {
      const message = `当前用户: ${userInfo.username}\n邮箱: ${userInfo.email}\n状态: 已登录`;
      
      const action = await vscode.window.showInformationMessage(
        message,
        '登出',
        '关闭'
      );

      if (action === '登出') {
        await this.showLogoutDialog();
      }
    } else {
      const action = await vscode.window.showInformationMessage(
        '当前未登录DocMate',
        '立即登录',
        '关闭'
      );

      if (action === '立即登录') {
        await this.showLoginDialog();
      }
    }
  }

  /**
   * 检查认证状态并在需要时提示登录
   */
  public async ensureAuthenticated(): Promise<boolean> {
    if (this.authService.isAuthenticated()) {
      // 验证Token是否仍然有效
      const isValid = await this.authService.validateToken();
      if (isValid) {
        return true;
      }
    }

    // 需要登录
    const action = await vscode.window.showWarningMessage(
      '使用AI功能需要先登录openEuler账户',
      '立即登录',
      '取消'
    );

    if (action === '立即登录') {
      return await this.showLoginDialog();
    }

    return false;
  }
}
