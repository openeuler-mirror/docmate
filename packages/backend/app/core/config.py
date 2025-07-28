import os
from typing import List
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """
    应用配置类
    """
    # 服务配置
    HOST: str = Field(default="0.0.0.0", description="服务监听地址")
    PORT: int = Field(default=8000, description="服务监听端口")
    DEBUG: bool = Field(default=False, description="调试模式")
    ENVIRONMENT: str = Field(default="development", description="运行环境")

    # JWT配置
    JWT_SECRET_KEY: str = Field(..., description="JWT密钥")
    JWT_ALGORITHM: str = Field(default="HS256", description="JWT算法")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=1440, description="JWT过期时间(分钟)")

    # openEuler认证配置
    OPENEULER_LOGIN_URL: str = Field(
        default="https://id.openeuler.org/login",
        description="openEuler登录页面URL"
    )
    OPENEULER_USER_INFO_URL: str = Field(
        default="https://id.openeuler.org/api/user/info",
        description="openEuler用户信息API URL"
    )

    # AI服务配置
    AI_API_KEY: str = Field(..., description="AI服务API密钥")
    AI_BASE_URL: str = Field(
        default="https://api.openai.com/v1",
        description="AI服务基础URL"
    )
    AI_MODEL: str = Field(default="gpt-3.5-turbo", description="AI模型名称")
    AI_TIMEOUT: int = Field(default=30, description="AI请求超时时间(秒)")
    AI_MAX_RETRIES: int = Field(default=3, description="AI请求最大重试次数")

    # CORS配置
    ALLOWED_ORIGINS: List[str] = Field(
        default=["vscode-webview://*", "https://localhost:*", "http://localhost:*"],
        description="允许的跨域来源"
    )

    # 日志配置
    LOG_LEVEL: str = Field(default="INFO", description="日志级别")

    # 开发模式配置
    MOCK_AUTH: bool = Field(default=False, description="是否启用Mock认证模式")

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 验证必需的配置
        self._validate_required_settings()

    def _validate_required_settings(self):
        """
        验证必需的配置项
        """
        required_fields = [
            "JWT_SECRET_KEY",
            "AI_API_KEY"
        ]
        
        missing_fields = []
        for field in required_fields:
            if not getattr(self, field, None):
                missing_fields.append(field)
        
        if missing_fields:
            raise ValueError(
                f"Missing required environment variables: {', '.join(missing_fields)}. "
                f"Please check your .env file or environment variables."
            )


# 创建全局设置实例
settings = Settings()
