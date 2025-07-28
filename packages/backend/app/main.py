from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.logger import setup_logging, get_logger
from app.routers import auth, api

# 设置日志
setup_logging()
logger = get_logger(__name__)

# 创建FastAPI应用
app = FastAPI(
    title="DocMate Backend",
    description="Backend service for DocMate VS Code extension with openEuler authentication",
    version="1.0.0",
)

# 配置CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(api.router, prefix="/api/v1", tags=["API"])

@app.get("/", tags=["Health"])
async def root():
    """
    健康检查接口
    """
    logger.info("Health check endpoint called")
    return {"status": "ok", "message": "DocMate Backend is running"}

@app.get("/health", tags=["Health"])
async def health_check():
    """
    详细健康检查接口
    """
    logger.info("Detailed health check endpoint called")
    return {
        "status": "ok",
        "version": app.version,
        "environment": settings.ENVIRONMENT,
        "debug_mode": settings.DEBUG,
    }

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    """
    HTTP异常处理器
    """
    logger.error(f"HTTP error: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"status": "error", "message": exc.detail},
    )

@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    """
    通用异常处理器
    """
    logger.error(f"Unhandled exception: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"status": "error", "message": "Internal server error"},
    )

if __name__ == "__main__":
    import uvicorn
    
    logger.info(f"Starting DocMate Backend on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
