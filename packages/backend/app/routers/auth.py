from datetime import timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from app.core.logger import get_logger
from app.core.security import create_access_token
from app.core.dependencies import require_auth
from app.models.auth import (
    SSOTokenRequest,
    TokenResponse,
    LoginUrlResponse,
    TokenRefreshRequest,
    UserInfo
)
from app.services.openeuler_auth import openeuler_auth_service

logger = get_logger(__name__)
router = APIRouter()


@router.get("/status")
async def auth_status():
    """
    认证状态检查接口
    """
    logger.info("Auth status check endpoint called")
    return {"status": "ok", "message": "Authentication service is running"}


@router.get("/login-url", response_model=LoginUrlResponse)
async def get_login_url():
    """
    获取openEuler登录URL

    Returns:
        包含登录URL和说明的响应
    """
    logger.info("Login URL request received")

    try:
        # 获取openEuler登录URL
        login_url = openeuler_auth_service.get_login_url()

        logger.info("Login URL generated successfully")

        return LoginUrlResponse(
            login_url=login_url,
            instructions="请在浏览器中完成openEuler登录，然后将Cookie中的_U_T_令牌提供给插件"
        )

    except Exception as e:
        logger.error("Failed to generate login URL", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate login URL"
        )


@router.post("/login", response_model=TokenResponse)
async def login(sso_request: SSOTokenRequest):
    """
    使用SSO凭据登录

    Args:
        sso_request: 包含会话Cookie和令牌的请求

    Returns:
        包含访问令牌和用户信息的响应
    """
    logger.info("Login request received with SSO credentials")

    try:
        # 验证SSO凭据并获取用户信息
        user_info = await openeuler_auth_service.get_user_info_by_sso(
            sso_request.session_cookie,
            sso_request.token
        )

        if not user_info:
            logger.error("Failed to get user info with SSO credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid SSO credentials or user not found"
            )

        # 创建内部JWT令牌 - 使用openEuler UserInfo字段
        token_data_for_jwt = {
            "sub": user_info.username,  # 使用username作为主键
            "photo": user_info.photo,
            "username": user_info.username,
            "email": user_info.email,
            "phoneCountryCode": user_info.phoneCountryCode,
            "phone": user_info.phone,
            "identities": [identity.dict() for identity in user_info.identities] if user_info.identities else [],
            "recipientId": user_info.recipientId,
        }

        access_token = create_access_token(data=token_data_for_jwt)

        logger.info("User logged in successfully", extra={"user_id": user_info.id})

        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=1440 * 60,  # 24小时，以秒为单位
            user_info=user_info
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error during login", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Login failed"
        )


@router.post("/refresh-token")
async def refresh_token(refresh_request: TokenRefreshRequest):
    """
    刷新一次性令牌

    Args:
        refresh_request: 包含会话Cookie和当前令牌的请求

    Returns:
        包含新令牌的响应
    """
    logger.info("Token refresh request received")

    try:
        # 使用当前凭据获取用户信息（这会触发新token的生成）
        user_info = await openeuler_auth_service.get_user_info_by_sso(
            refresh_request.session_cookie,
            refresh_request.current_token
        )

        if not user_info:
            logger.error("Failed to refresh token with current credentials")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid credentials for token refresh"
            )

        logger.info("Token refreshed successfully")
        return {"status": "success", "message": "Token refreshed"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Unexpected error during token refresh", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )


@router.post("/logout")
async def logout(current_user: UserInfo = Depends(require_auth)):
    """
    用户登出

    Args:
        current_user: 当前认证用户

    Returns:
        登出成功响应
    """
    logger.info("Logout request received", extra={"user_id": current_user.id})

    try:
        # 注意：JWT令牌是无状态的，无法在服务端撤销
        # 在实际生产环境中，可以考虑：
        # 1. 维护一个黑名单来记录已撤销的令牌
        # 2. 使用较短的令牌过期时间
        # 3. 实现令牌刷新机制

        logger.info("User logged out successfully", extra={"user_id": current_user.id})

        return {
            "status": "success",
            "message": "Logged out successfully"
        }

    except Exception as e:
        logger.error("Unexpected error during logout", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )


@router.get("/me", response_model=UserInfo)
async def get_current_user_info(current_user: UserInfo = Depends(require_auth)):
    """
    获取当前用户信息

    Args:
        current_user: 当前认证用户

    Returns:
        当前用户信息
    """
    logger.info("Get current user info request", extra={"user_id": current_user.id})
    return current_user


@router.post("/verify")
async def verify_token_endpoint(current_user: UserInfo = Depends(require_auth)):
    """
    验证令牌有效性

    Args:
        current_user: 当前认证用户

    Returns:
        令牌验证结果
    """
    logger.info("Token verification request", extra={"user_id": current_user.id})

    return {
        "status": "valid",
        "user_id": current_user.id,
        "username": current_user.username
    }
