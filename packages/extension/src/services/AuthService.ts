import * as vscode from 'vscode';
import { configService } from '@docmate/utils';

/**
 * 认证状态
 */
export enum AuthStatus {
  NOT_AUTHENTICATED = 'not_authenticated',
  AUTHENTICATING = 'authenticating',
  AUTHENTICATED = 'authenticated',
  ERROR = 'error'
}

/**
 * 用户信息接口
 */
export interface UserInfo {
  photo: string;
  username: string;
  email: string;
  phoneCountryCode?: string;
  phone?: string;
  identities: any[];
  recipientId?: number;
}

/**
 * 认证响应接口
 */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user_info: UserInfo;
  new_token?: string;
}

/**
 * SSO认证请求接口
 */
export interface SSOAuthRequest {
  session_cookie: string;  // _Y_G_
  token?: string;          // _U_T_
}

/**
 * openEuler认证服务
 * 基于SSO Cookie的认证机制
 */
export class AuthService {
  private static instance: AuthService;
  private secretStorage: vscode.SecretStorage;
  private status: AuthStatus = AuthStatus.NOT_AUTHENTICATED;
  private userInfo: UserInfo | null = null;
  private accessToken: string | null = null;
  private currentToken: string | null = null;  // 当前的一次性token

  private readonly TOKEN_KEY = 'docmate.auth.token';
  private readonly USER_INFO_KEY = 'docmate.auth.userInfo';
  private readonly CURRENT_TOKEN_KEY = 'docmate.auth.currentToken';

  private constructor(secretStorage: vscode.SecretStorage) {
    this.secretStorage = secretStorage;
  }

  public static getInstance(secretStorage?: vscode.SecretStorage): AuthService {
    if (!AuthService.instance) {
      if (!secretStorage) {
        throw new Error('SecretStorage is required for first initialization');
      }
      AuthService.instance = new AuthService(secretStorage);
    }
    return AuthService.instance;
  }

  /**
   * 初始化认证服务
   * 检查是否有已保存的认证信息
   */
  public async initialize(): Promise<void> {
    try {
      const savedToken = await this.secretStorage.get(this.TOKEN_KEY);
      const savedUserInfo = await this.secretStorage.get(this.USER_INFO_KEY);
      const savedCurrentToken = await this.secretStorage.get(this.CURRENT_TOKEN_KEY);

      if (savedToken && savedUserInfo) {
        this.accessToken = savedToken;
        this.userInfo = JSON.parse(savedUserInfo);
        this.currentToken = savedCurrentToken || null;
        this.status = AuthStatus.AUTHENTICATED;
        console.log('AuthService: Restored authentication from storage');
      } else {
        this.status = AuthStatus.NOT_AUTHENTICATED;
        console.log('AuthService: No saved authentication found');
      }
    } catch (error) {
      console.error('AuthService: Failed to initialize:', error);
      this.status = AuthStatus.ERROR;
    }
  }

  /**
   * 获取认证状态
   */
  public getStatus(): AuthStatus {
    return this.status;
  }

  /**
   * 获取用户信息
   */
  public getUserInfo(): UserInfo | null {
    return this.userInfo;
  }

  /**
   * 获取访问令牌
   */
  public getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * 检查是否已认证
   */
  public isAuthenticated(): boolean {
    return this.status === AuthStatus.AUTHENTICATED && !!this.accessToken;
  }

  /**
   * 获取openEuler登录URL
   */
  public async getLoginUrl(): Promise<string> {
    try {
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/login-url`);
      
      if (!response.ok) {
        let errorMessage = "获取登录URL失败";
        if (response.status === 500) {
          errorMessage = "后端服务暂时不可用，请稍后重试";
        } else if (response.status === 404) {
          errorMessage = "登录服务未找到，请检查后端配置";
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json() as { login_url: string };
      return data.login_url;
    } catch (error) {
      console.error('AuthService: Failed to get login URL:', error);
      throw error;
    }
  }

  /**
   * 使用SSO凭据登录
   */
  public async loginWithSSOCredentials(sessionCookie: string, token?: string): Promise<AuthResponse> {
    try {
      this.status = AuthStatus.AUTHENTICATING;
      
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_cookie: sessionCookie,
          token: token
        })
      });

      if (!response.ok) {
        let errorMessage = `登录失败 (${response.status})`;
        try {
          const errorData = await response.json() as { detail?: string; message?: string };
          if (errorData.detail) {
            errorMessage = errorData.detail;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // 如果无法解析JSON，使用默认错误信息
          if (response.status === 401) {
            errorMessage = "认证失败，请检查Token是否正确";
          } else if (response.status === 500) {
            errorMessage = "服务器内部错误，请稍后重试";
          } else {
            errorMessage = `请求失败: ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }

      const authResponse = await response.json() as AuthResponse;
      
      // 保存认证信息
      await this.saveAuthInfo(authResponse);
      
      this.status = AuthStatus.AUTHENTICATED;
      console.log('AuthService: Login successful');
      
      return authResponse;
    } catch (error) {
      this.status = AuthStatus.ERROR;
      console.error('AuthService: Login failed:', error);
      throw error;
    }
  }

  /**
   * 登出
   */
  public async logout(): Promise<void> {
    try {
      // 清除本地存储
      await this.secretStorage.delete(this.TOKEN_KEY);
      await this.secretStorage.delete(this.USER_INFO_KEY);
      await this.secretStorage.delete(this.CURRENT_TOKEN_KEY);

      // 重置状态
      this.accessToken = null;
      this.userInfo = null;
      this.currentToken = null;
      this.status = AuthStatus.NOT_AUTHENTICATED;
      
      console.log('AuthService: Logout successful');
    } catch (error) {
      console.error('AuthService: Logout failed:', error);
      throw error;
    }
  }

  /**
   * 刷新一次性token
   */
  public async refreshToken(sessionCookie: string): Promise<void> {
    if (!this.currentToken) {
      throw new Error('No current token to refresh');
    }

    try {
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_cookie: sessionCookie,
          current_token: this.currentToken
        })
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`);
      }

      console.log('AuthService: Token refreshed successfully');
    } catch (error) {
      console.error('AuthService: Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * 获取当前token
   */
  public getCurrentToken(): string | null {
    return this.currentToken;
  }

  /**
   * 兼容性方法：使用SSO Token登录（旧接口）
   * @deprecated 请使用 loginWithSSOCredentials 方法
   */
  public async loginWithSSOToken(ssoToken: string): Promise<AuthResponse> {
    // 将旧的ssoToken作为sessionCookie处理
    return this.loginWithSSOCredentials(ssoToken);
  }

  /**
   * 验证当前令牌是否有效
   */
  public async validateToken(): Promise<boolean> {
    if (!this.accessToken) {
      return false;
    }

    try {
      const backendUrl = configService.getBackendBaseUrl();
      const response = await fetch(`${backendUrl}/auth/verify`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        return true;
      } else {
        // Token无效，清除认证信息
        await this.logout();
        return false;
      }
    } catch (error) {
      console.error('AuthService: Token validation failed:', error);
      return false;
    }
  }

  /**
   * 保存认证信息到安全存储
   */
  private async saveAuthInfo(authResponse: AuthResponse): Promise<void> {
    try {
      await this.secretStorage.store(this.TOKEN_KEY, authResponse.access_token);
      await this.secretStorage.store(this.USER_INFO_KEY, JSON.stringify(authResponse.user_info));

      // 保存新的一次性token（如果有）
      if (authResponse.new_token) {
        await this.secretStorage.store(this.CURRENT_TOKEN_KEY, authResponse.new_token);
        this.currentToken = authResponse.new_token;
      }

      this.accessToken = authResponse.access_token;
      this.userInfo = authResponse.user_info;
    } catch (error) {
      console.error('AuthService: Failed to save auth info:', error);
      throw error;
    }
  }

  /**
   * 获取认证头
   */
  public getAuthHeaders(): Record<string, string> {
    if (!this.accessToken) {
      throw new Error('Not authenticated');
    }
    
    return {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }
}
