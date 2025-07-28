from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import verify_token
from app.core.logger import get_logger
from app.models.auth import UserInfo, Identity

logger = get_logger(__name__)

# HTTP Bearer认证方案
security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> UserInfo:
    """
    获取当前认证用户

    Args:
        credentials: HTTP Bearer认证凭据

    Returns:
        当前用户信息

    Raises:
        HTTPException: 认证失败时抛出401错误
    """
    if credentials is None:
        logger.warning("No authorization header provided")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    logger.debug(f"Received token: {token[:20]}..." if len(token) > 20 else token)

    # 验证JWT令牌
    try:
        payload = verify_token(token)
        if payload is None:
            logger.warning("Invalid or expired token provided")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except Exception as e:
        logger.error(f"Error during token verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token verification failed",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 从payload中提取用户信息
    try:
        if payload is None:
            logger.warning("Token validation failed")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )

        # 重建Identity对象
        identities_data = payload.get("identities", [])
        identities = []
        for identity_data in identities_data:
            if isinstance(identity_data, dict):
                identities.append(Identity(**identity_data))

        user_info = UserInfo(
            photo=payload.get("photo", ""),
            username=payload.get("username", ""),
            email=payload.get("email", ""),
            phoneCountryCode=payload.get("phoneCountryCode"),
            phone=payload.get("phone"),
            identities=identities,
            recipientId=payload.get("recipientId")
        )

        logger.debug("User authenticated successfully", extra={"user_id": user_info.id})
        return user_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to parse user info from token", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False))
) -> Optional[UserInfo]:
    """
    获取可选的当前认证用户（不强制要求认证）
    
    Args:
        credentials: 可选的HTTP Bearer认证凭据
        
    Returns:
        当前用户信息，如果未认证则返回None
    """
    if credentials is None:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def require_auth(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """
    要求用户认证的依赖
    
    Args:
        user: 当前用户信息
        
    Returns:
        当前用户信息
    """
    return user
