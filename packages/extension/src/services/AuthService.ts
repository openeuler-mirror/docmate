import * as vscode from 'vscode';

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
 * 简化的认证服务（空实现）
 * 认证功能留待后续版本实现
 */
export class AuthService {
  private static instance: AuthService;
  private secretStorage: vscode.SecretStorage;
  private status: AuthStatus = AuthStatus.NOT_AUTHENTICATED;
  private userInfo: UserInfo | null = null;
  private accessToken: string | null = null;

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
   * 初始化认证服务（空实现）
   */
  public async initialize(): Promise<void> {
    // 认证功能暂未实现，保持未认证状态
    this.status = AuthStatus.NOT_AUTHENTICATED;
    console.log('AuthService: Initialized (not implemented)');
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
    return false; // 始终返回未认证
  }

  /**
   * 验证Token是否有效（空实现）
   */
  public async validateToken(): Promise<boolean> {
    return false;
  }

  /**
   * 登出（空实现）
   */
  public async logout(): Promise<void> {
    this.accessToken = null;
    this.userInfo = null;
    this.status = AuthStatus.NOT_AUTHENTICATED;
    console.log('AuthService: Logout (not implemented)');
  }

  /**
   * 使用SSO Token登录（空实现）
   */
  public async loginWithSSOToken(_token: string): Promise<AuthResponse> {
    throw new Error('Login with SSO token not implemented');
  }

  /**
   * 使用SSO凭据登录（空实现）
   */
  public async loginWithSSOCredentials(_sessionCookie: string, _token?: string): Promise<AuthResponse> {
    throw new Error('Login with SSO credentials not implemented');
  }
}