from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from app.core.logger import get_logger
from app.core.dependencies import require_auth
from app.models.auth import UserInfo
from app.models.api import (
    CheckRequest, PolishRequest, TranslateRequest, RewriteRequest,
    CheckResponse, PolishResponse, TranslateResponse, RewriteResponse
)
from app.services.ai_proxy import ai_proxy_service

logger = get_logger(__name__)
router = APIRouter()


@router.get("/status")
async def api_status():
    """
    API状态检查接口
    """
    logger.info("API status check endpoint called")
    return {"status": "ok", "message": "API service is running"}


@router.post("/check", response_model=CheckResponse)
async def check_text(
    request: CheckRequest,
    current_user: UserInfo = Depends(require_auth)
):
    """
    文本检查接口

    Args:
        request: 检查请求
        current_user: 当前认证用户

    Returns:
        检查结果
    """
    logger.info("Check text request received", extra={"user_id": current_user.id})

    try:
        result = await ai_proxy_service.check_text(request, current_user.id)
        logger.info("Check text completed successfully", extra={"user_id": current_user.id})
        return result

    except Exception as e:
        logger.error("Check text failed", extra={"user_id": current_user.id, "error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Text check failed"
        )


@router.post("/polish", response_model=PolishResponse)
async def polish_text(
    request: PolishRequest,
    current_user: UserInfo = Depends(require_auth)
):
    """
    文本润色接口

    Args:
        request: 润色请求
        current_user: 当前认证用户

    Returns:
        润色结果
    """
    logger.info("Polish text request received", extra={"user_id": current_user.id})

    try:
        result = await ai_proxy_service.polish_text(request, current_user.id)
        logger.info("Polish text completed successfully", extra={"user_id": current_user.id})
        return result

    except Exception as e:
        logger.error("Polish text failed", extra={"user_id": current_user.id, "error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Text polish failed"
        )


@router.post("/translate", response_model=TranslateResponse)
async def translate_text(
    request: TranslateRequest,
    current_user: UserInfo = Depends(require_auth)
):
    """
    文本翻译接口

    Args:
        request: 翻译请求
        current_user: 当前认证用户

    Returns:
        翻译结果
    """
    logger.info("Translate text request received", extra={"user_id": current_user.id})

    try:
        result = await ai_proxy_service.translate_text(request, current_user.id)
        logger.info("Translate text completed successfully", extra={"user_id": current_user.id})
        return result

    except Exception as e:
        logger.error("Translate text failed", extra={"user_id": current_user.id, "error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Text translation failed"
        )


@router.post("/rewrite", response_model=RewriteResponse)
async def rewrite_text(
    request: RewriteRequest,
    current_user: UserInfo = Depends(require_auth)
):
    """
    文本改写接口

    Args:
        request: 改写请求
        current_user: 当前认证用户

    Returns:
        改写结果
    """
    logger.info("Rewrite text request received", extra={"user_id": current_user.id})

    try:
        result = await ai_proxy_service.rewrite_text(request, current_user.id)
        logger.info("Rewrite text completed successfully", extra={"user_id": current_user.id})
        return result

    except Exception as e:
        logger.error("Rewrite text failed", extra={"user_id": current_user.id, "error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Text rewrite failed"
        )
