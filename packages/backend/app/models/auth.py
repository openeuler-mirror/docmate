from typing import Optional, List
from pydantic import BaseModel, Field


class SSOTokenRequest(BaseModel):
    """
    SSO Token请求模型
    """
    sso_token: str = Field(..., description="从openEuler SSO Cookie中获取的_U_T_令牌")


class TokenResponse(BaseModel):
    """
    Token响应模型
    """
    access_token: str = Field(..., description="访问令牌")
    token_type: str = Field(default="bearer", description="令牌类型")
    expires_in: int = Field(..., description="过期时间(秒)")
    user_info: "UserInfo" = Field(..., description="用户信息")


class Identity(BaseModel):
    """
    第三方身份信息
    """
    login_name: str = Field(..., description="登录名")
    userIdInIdp: str = Field(..., description="第三方平台用户ID")
    identity: str = Field(..., description="第三方平台类型，如gitee/github")
    user_name: str = Field(..., description="用户名")
    accessToken: str = Field(..., description="访问令牌")


class UserInfo(BaseModel):
    """
    用户信息模型 - 基于openEuler API响应结构
    """
    photo: str = Field(..., description="头像URL")
    username: str = Field(..., description="用户名")
    email: str = Field(..., description="邮箱")
    phoneCountryCode: Optional[str] = Field(None, description="区号")
    phone: Optional[str] = Field(None, description="手机号")
    identities: List[Identity] = Field(default=[], description="绑定的第三方平台账号")
    recipientId: Optional[int] = Field(None, description="接收人ID")

    # 为了兼容现有代码，添加一些计算属性
    @property
    def id(self) -> str:
        """用户ID，使用username作为唯一标识"""
        return self.username

    @property
    def name(self) -> str:
        """显示名称，使用username"""
        return self.username

    @property
    def avatar_url(self) -> str:
        """头像URL，使用photo字段"""
        return self.photo


class LoginUrlResponse(BaseModel):
    """
    登录URL响应模型
    """
    login_url: str = Field(..., description="openEuler登录页面URL")
    instructions: str = Field(..., description="登录说明")


class LogoutRequest(BaseModel):
    """
    登出请求模型
    """
    token: str = Field(..., description="要撤销的令牌")


class AuthError(BaseModel):
    """
    认证错误模型
    """
    error: str = Field(..., description="错误类型")
    error_description: Optional[str] = Field(None, description="错误描述")
    error_uri: Optional[str] = Field(None, description="错误详情URI")


# 更新前向引用
TokenResponse.model_rebuild()
