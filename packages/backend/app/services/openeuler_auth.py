import httpx
from typing import Optional, Dict, Any
from app.core.config import settings
from app.core.logger import get_logger
from app.models.auth import UserInfo

logger = get_logger(__name__)


class OpenEulerAuthService:
    """
    openEuler认证服务 - 基于Cookie的认证机制
    """

    def __init__(self):
        self.login_url = settings.OPENEULER_LOGIN_URL
        self.user_info_url = settings.OPENEULER_USER_INFO_URL
        self.permission_url = settings.OPENEULER_PERMISSION_URL
        # openEuler的Cookie名称
        self.session_cookie_name = settings.OPENEULER_SESSION_COOKIE  # _Y_G_
        self.token_cookie_name = settings.OPENEULER_TOKEN_COOKIE      # _U_T_

    def get_login_url(self, redirect_uri: Optional[str] = None) -> str:
        """
        获取openEuler登录URL

        Args:
            redirect_uri: 登录成功后的重定向地址

        Returns:
            登录URL
        """
        login_url = self.login_url
        if redirect_uri:
            # 如果需要重定向，可以添加参数
            login_url += f"?redirect_uri={redirect_uri}"

        logger.info("Generated login URL", extra={"redirect_uri": redirect_uri})
        return login_url

    async def verify_sso_credentials(self, session_cookie: str, token: Optional[str] = None) -> bool:
        """
        验证SSO凭据的有效性

        Args:
            session_cookie: 会话Cookie (_Y_G_)
            token: 令牌 (_U_T_，可选)

        Returns:
            凭据是否有效
        """
        if not session_cookie:
            logger.warning("No session cookie provided")
            return False

        try:
            # 尝试使用SSO凭据获取用户信息来验证其有效性
            user_info = await self.get_user_info_by_sso(session_cookie, token)
            return user_info is not None

        except Exception as e:
            logger.error("Error verifying SSO credentials", extra={"error": str(e)})
            return False

    async def get_user_info_by_sso(self, session_cookie: str, token: Optional[str] = None) -> Optional[UserInfo]:
        """
        使用SSO Cookie和Token获取用户信息

        Args:
            session_cookie: 会话Cookie (_Y_G_)
            token: 令牌 (_U_T_，可选)

        Returns:
            用户信息
        """
        # Mock认证模式
        if settings.MOCK_AUTH:
            logger.info("Using mock authentication mode")
            return UserInfo(
                photo="https://avatar.example.com/mock-user.jpg",
                username="mock_user",
                email="mock@openeuler.org",
                phoneCountryCode="+86",
                phone="13800138000",
                identities=[],
                recipientId=12345
            )

        # 构建请求头
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Cookie": f"{self.session_cookie_name}={session_cookie}",
        }

        # 如果有token，添加到请求头
        if token:
            headers["token"] = token

        try:
            async with httpx.AsyncClient() as client:
                # 使用permission接口获取用户信息
                response = await client.get(
                    self.permission_url,
                    headers=headers,
                    timeout=30.0
                )

                if response.status_code == 200:
                    api_response = response.json()
                    logger.info("Successfully retrieved user info", extra={"response": api_response})

                    # 检查API响应格式
                    if api_response.get("code") != 200:
                        logger.error("API returned error", extra={"response": api_response})
                        return None

                    user_data = api_response.get("data", {})
                    if not user_data:
                        logger.error("No user data in response")
                        return None

                    # 提取新的token（如果存在）
                    new_token = response.headers.get("token") or response.headers.get("Token")
                    if new_token:
                        logger.info("Received new token from server")
                        # 这里可以添加token存储逻辑，或者返回给调用者处理
                        user_data["new_token"] = new_token

                    # 转换为UserInfo模型
                    return UserInfo(
                        photo=user_data.get("photo", ""),
                        username=user_data.get("username", ""),
                        email=user_data.get("email", ""),
                        phoneCountryCode=user_data.get("phoneCountryCode"),
                        phone=user_data.get("phone"),
                        identities=user_data.get("identities", []),
                        recipientId=user_data.get("recipientId")
                    )
                else:
                    logger.error(
                        "Failed to get user info",
                        extra={
                            "status_code": response.status_code,
                            "response": response.text
                        }
                    )
                    return None

        except httpx.RequestError as e:
            logger.error("Network error during user info retrieval", extra={"error": str(e)})
            return None
        except Exception as e:
            logger.error("Unexpected error during user info retrieval", extra={"error": str(e)})
            return None

    def clear_user_auth(self) -> Dict[str, str]:
        """
        清除用户认证凭据 (返回清除Cookie的指令)

        Returns:
            清除Cookie的响应头
        """
        logger.info("Clearing user authentication")

        # 返回清除两个Cookie的指令
        return {
            "Set-Cookie": f"{self.session_cookie_name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure, {self.token_cookie_name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure"
        }


# 创建全局实例
openeuler_auth_service = OpenEulerAuthService()
