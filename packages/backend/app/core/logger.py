import logging
import sys
from typing import Optional
import structlog
from app.core.config import settings


def setup_logging():
    """
    设置结构化日志
    """
    # 配置structlog
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # 配置标准库logging
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=getattr(logging, settings.LOG_LEVEL.upper()),
    )


def get_logger(name: Optional[str] = None) -> structlog.stdlib.BoundLogger:
    """
    获取结构化日志记录器
    
    Args:
        name: 日志记录器名称，通常使用 __name__
        
    Returns:
        结构化日志记录器实例
    """
    return structlog.get_logger(name)
