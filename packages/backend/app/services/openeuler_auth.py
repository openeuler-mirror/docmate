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
        # openEuler的SSO Token Cookie名称
        self.sso_cookie_name = "_U_T_"

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

    async def verify_sso_token(self, sso_token: str) -> bool:
        """
        验证SSO Token的有效性

        Args:
            sso_token: 从Cookie中获取的SSO Token

        Returns:
            Token是否有效
        """
        if not sso_token:
            logger.warning("No SSO token provided")
            return False

        try:
            # 尝试使用SSO Token获取用户信息来验证其有效性
            user_info = await self.get_user_info_by_sso(sso_token)
            return user_info is not None

        except Exception as e:
            logger.error("Error verifying SSO token", extra={"error": str(e)})
            return False

    async def get_user_info_by_sso(self, sso_token: str) -> Optional[UserInfo]:
        """
        使用SSO Token获取用户信息

        Args:
            sso_token: SSO Token

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

        headers = {
            "Accept": "application/json",
            "Cookie": f"{self.sso_cookie_name}={sso_token}",
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    self.user_info_url,
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

        # 返回清除Cookie的指令
        return {
            "Set-Cookie": f"{self.sso_cookie_name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure"
        }


# 创建全局实例
openeuler_auth_service = OpenEulerAuthService()
