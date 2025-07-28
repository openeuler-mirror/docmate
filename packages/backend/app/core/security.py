from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import jwt
from passlib.context import CryptContext
from app.core.config import settings
from app.core.logger import get_logger

logger = get_logger(__name__)

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    """
    创建JWT访问令牌
    
    Args:
        data: 要编码的数据
        expires_delta: 过期时间增量
        
    Returns:
        JWT令牌字符串
    """
    to_encode = data.copy()
    
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    
    try:
        encoded_jwt = jwt.encode(
            to_encode, 
            settings.JWT_SECRET_KEY, 
            algorithm=settings.JWT_ALGORITHM
        )
        logger.info("JWT token created successfully", extra={"user_id": data.get("sub")})
        return encoded_jwt
    except Exception as e:
        logger.error("Failed to create JWT token", extra={"error": str(e)})
        raise


def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """
    验证JWT令牌

    Args:
        token: JWT令牌字符串

    Returns:
        解码后的数据，如果验证失败返回None
    """
    if not token or not isinstance(token, str):
        logger.warning("Invalid token format")
        return None

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM]
        )

        # 检查令牌是否过期
        exp = payload.get("exp")
        if exp and datetime.utcnow() > datetime.fromtimestamp(exp):
            logger.warning("JWT token expired", extra={"user_id": payload.get("sub")})
            return None

        logger.debug("JWT token verified successfully", extra={"user_id": payload.get("sub")})
        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("JWT token expired")
        return None
    except jwt.JWTError as e:
        logger.warning("JWT token validation failed", extra={"error": str(e)})
        return None
    except Exception as e:
        logger.error("Unexpected error during JWT validation", extra={"error": str(e)})
        return None


def get_password_hash(password: str) -> str:
    """
    生成密码哈希
    
    Args:
        password: 明文密码
        
    Returns:
        哈希后的密码
    """
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    验证密码
    
    Args:
        plain_password: 明文密码
        hashed_password: 哈希密码
        
    Returns:
        验证结果
    """
    return pwd_context.verify(plain_password, hashed_password)


def generate_state() -> str:
    """
    生成OAuth状态参数
    
    Returns:
        随机状态字符串
    """
    import secrets
    return secrets.token_urlsafe(32)
