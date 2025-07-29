import httpx
import json
import re
from typing import Optional, List, Dict, Any
from app.core.config import settings
from app.core.logger import get_logger
from app.models.api import (
    CheckRequest, PolishRequest, TranslateRequest, RewriteRequest,
    CheckResponse, PolishResponse, TranslateResponse, RewriteResponse,
    DiffSegment, CheckIssue, PolishChange
)
from app.prompts.check_prompts import build_check_prompt, build_terminology_check_prompt
from app.prompts.polish_prompts import build_polish_prompt, build_clarity_polish_prompt
from app.prompts.translate_prompts import build_translate_prompt, build_full_document_translate_prompt
from app.prompts.rewrite_prompts import build_rewrite_prompt, build_style_rewrite_prompt

logger = get_logger(__name__)


class AIProxyService:
    """
    AI代理服务 - 安全地代理对AI服务的请求
    """
    
    def __init__(self):
        self.api_key = settings.AI_API_KEY
        self.base_url = settings.AI_BASE_URL
        self.model = settings.AI_MODEL
        self.timeout = settings.AI_TIMEOUT
        self.max_retries = settings.AI_MAX_RETRIES
        
    async def check_text(self, request: CheckRequest, user_id: str) -> CheckResponse:
        """
        文本检查
        
        Args:
            request: 检查请求
            user_id: 用户ID
            
        Returns:
            检查结果
        """
        logger.info("Processing text check request", extra={"user_id": user_id})
        
        # 构建检查提示词
        check_types = []
        if request.enable_grammar:
            check_types.append("语法错误")
        if request.enable_style:
            check_types.append("写作风格")
        if request.enable_terminology:
            check_types.append("术语使用")
        if request.enable_consistency:
            check_types.append("内容一致性")

        prompt = build_check_prompt(request.text, check_types, request.strict_mode)
        
        try:
            # 调用AI服务
            ai_response = await self._call_ai_service(prompt, user_id)
            
            # 解析AI响应
            result = self._parse_check_response(ai_response, request.text)
            
            logger.info("Text check completed successfully", extra={"user_id": user_id})
            return result
            
        except Exception as e:
            logger.error("Text check failed", extra={"user_id": user_id, "error": str(e)})
            raise
    
    async def polish_text(self, request: PolishRequest, user_id: str) -> PolishResponse:
        """
        文本润色
        
        Args:
            request: 润色请求
            user_id: 用户ID
            
        Returns:
            润色结果
        """
        logger.info("Processing text polish request", extra={"user_id": user_id})
        
        # 构建润色提示词
        prompt = build_polish_prompt(request.text, focus_on="all", target_audience="technical")
        
        try:
            # 调用AI服务
            ai_response = await self._call_ai_service(prompt, user_id)
            
            # 解析润色响应
            result = self._parse_polish_response(ai_response, request.text)
            
            logger.info("Text polish completed successfully", extra={"user_id": user_id})
            return result
            
        except Exception as e:
            logger.error("Text polish failed", extra={"user_id": user_id, "error": str(e)})
            raise
    
    async def translate_text(self, request: TranslateRequest, user_id: str) -> TranslateResponse:
        """
        文本翻译
        
        Args:
            request: 翻译请求
            user_id: 用户ID
            
        Returns:
            翻译结果
        """
        logger.info("Processing text translation request", extra={"user_id": user_id})
        
        # 构建翻译提示词
        prompt = build_translate_prompt(
            text=request.text,
            source_language=request.language or "auto",
            target_language=request.target_language,
            preserve_terminology=request.preserve_terminology,
            context=""
        )
        
        try:
            # 调用AI服务
            ai_response = await self._call_ai_service(prompt, user_id)
            
            # 解析翻译响应
            result = self._parse_translate_response(ai_response, request)
            
            logger.info("Text translation completed successfully", extra={"user_id": user_id})
            return result
            
        except Exception as e:
            logger.error("Text translation failed", extra={"user_id": user_id, "error": str(e)})
            raise
    
    async def rewrite_text(self, request: RewriteRequest, user_id: str) -> RewriteResponse:
        """
        文本改写
        
        Args:
            request: 改写请求
            user_id: 用户ID
            
        Returns:
            改写结果
        """
        logger.info("Processing text rewrite request", extra={"user_id": user_id})
        
        # 构建改写提示词
        prompt = build_rewrite_prompt(
            original_text=request.text,
            user_instruction=request.instruction,
            preserve_terminology=True
        )
        
        try:
            # 调用AI服务（支持对话历史）
            ai_response = await self._call_ai_service(
                prompt, 
                user_id, 
                conversation_history=request.conversation_history
            )
            
            # 解析改写响应
            result = self._parse_rewrite_response(ai_response, request, user_id)
            
            logger.info("Text rewrite completed successfully", extra={"user_id": user_id})
            return result
            
        except Exception as e:
            logger.error("Text rewrite failed", extra={"user_id": user_id, "error": str(e)})
            raise

    async def _call_ai_service(
        self,
        prompt: str,
        user_id: str,
        conversation_history: Optional[List[Dict[str, Any]]] = None
    ) -> str:
        """
        调用AI服务

        Args:
            prompt: 提示词
            user_id: 用户ID
            conversation_history: 对话历史

        Returns:
            AI响应文本
        """
        # 构建消息列表
        messages = []

        # 添加对话历史
        if conversation_history:
            for msg in conversation_history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })

        # 添加当前提示词
        messages.append({"role": "user", "content": prompt})

        # 构建请求体
        request_body = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.7,
            "max_tokens": 2000,
        }

        # 重试机制
        for attempt in range(self.max_retries):
            try:
                async with httpx.AsyncClient() as client:
                    response = await client.post(
                        f"{self.base_url}/chat/completions",
                        headers={
                            "Content-Type": "application/json",
                            "Authorization": f"Bearer {self.api_key}",
                        },
                        json=request_body,
                        timeout=self.timeout
                    )

                    if response.status_code == 200:
                        data = response.json()
                        content = data["choices"][0]["message"]["content"]

                        logger.debug(
                            "AI service call successful",
                            extra={
                                "user_id": user_id,
                                "attempt": attempt + 1,
                                "response_length": len(content)
                            }
                        )

                        return content
                    else:
                        logger.warning(
                            "AI service returned error",
                            extra={
                                "user_id": user_id,
                                "status_code": response.status_code,
                                "response": response.text,
                                "attempt": attempt + 1
                            }
                        )

                        if attempt == self.max_retries - 1:
                            raise Exception(f"AI service error: {response.status_code} - {response.text}")

            except httpx.RequestError as e:
                logger.warning(
                    "AI service request failed",
                    extra={
                        "user_id": user_id,
                        "error": str(e),
                        "attempt": attempt + 1
                    }
                )

                if attempt == self.max_retries - 1:
                    raise Exception(f"AI service request failed: {str(e)}")

            # 指数退避
            if attempt < self.max_retries - 1:
                import asyncio
                await asyncio.sleep(2 ** attempt)

        raise Exception("AI service call failed after all retries")

    def _extract_json_from_response(self, response_text: str) -> Dict[str, Any]:
        """
        从AI响应中提取JSON内容

        Args:
            response_text: AI响应文本

        Returns:
            解析后的JSON对象
        """
        try:
            # 尝试直接解析整个响应
            return json.loads(response_text.strip())
        except json.JSONDecodeError:
            pass

        # 尝试提取JSON代码块
        json_pattern = r'```json\s*(.*?)\s*```'
        match = re.search(json_pattern, response_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(1).strip())
            except json.JSONDecodeError:
                pass

        # 尝试提取花括号内容
        brace_pattern = r'\{.*\}'
        match = re.search(brace_pattern, response_text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                pass

        # 如果都失败了，返回一个包含原始响应的默认结构
        logger.warning("Failed to extract JSON from AI response", extra={"response": response_text[:200]})
        return {
            "error": "Failed to parse JSON response",
            "raw_response": response_text
        }






    def _calculate_diff(self, original: str, modified: str) -> List[DiffSegment]:
        """
        计算文本差异

        Args:
            original: 原始文本
            modified: 修改后文本

        Returns:
            差异片段列表
        """
        try:
            from difflib import SequenceMatcher

            # 使用difflib计算差异
            matcher = SequenceMatcher(None, original, modified)
            diffs = []

            for tag, i1, i2, j1, j2 in matcher.get_opcodes():
                if tag == 'equal':
                    diffs.append(DiffSegment(type='equal', value=original[i1:i2]))
                elif tag == 'delete':
                    diffs.append(DiffSegment(type='delete', value=original[i1:i2]))
                elif tag == 'insert':
                    diffs.append(DiffSegment(type='insert', value=modified[j1:j2]))
                elif tag == 'replace':
                    if i1 < i2:
                        diffs.append(DiffSegment(type='delete', value=original[i1:i2]))
                    if j1 < j2:
                        diffs.append(DiffSegment(type='insert', value=modified[j1:j2]))

            return diffs

        except Exception as e:
            logger.error(f"Failed to calculate diff: {str(e)}")
            # 如果差异计算失败，返回简单的替换
            return [
                DiffSegment(type='delete', value=original),
                DiffSegment(type='insert', value=modified)
            ]

    def _parse_check_response(self, ai_response: str, original_text: str) -> CheckResponse:
        """
        解析检查响应

        Args:
            ai_response: AI响应
            original_text: 原始文本

        Returns:
            检查结果
        """
        try:
            # 使用新的JSON解析方法
            response_data = self._extract_json_from_response(ai_response)

            if "error" in response_data:
                # JSON解析失败，返回原文本和友好的错误提示
                corrected_text = original_text
                issues = [
                    CheckIssue(
                        message="AI服务响应格式异常，无法解析检查结果",
                        suggestion="请重试或联系管理员检查AI服务配置",
                        range=[0, len(original_text)],
                        severity="warning",
                        category="system"
                    )
                ]
            else:
                # 成功解析JSON
                corrected_text = response_data.get("correctedText", original_text)
                issues = []

                # 解析问题列表
                for issue_data in response_data.get("issues", []):
                    issues.append(CheckIssue(
                        message=issue_data.get("message", ""),
                        suggestion=issue_data.get("suggestion", ""),
                        range=[
                            issue_data.get("start", 0),
                            issue_data.get("end", len(original_text))
                        ],
                        severity=issue_data.get("severity", "info"),
                        category=issue_data.get("type", "general")
                    ))

            # 计算差异
            diffs = self._calculate_diff(original_text, corrected_text)

            return CheckResponse(
                diffs=diffs,
                issues=issues,
                corrected_text=corrected_text
            )

        except Exception as e:
            logger.error(f"Failed to parse check response: {str(e)}")
            # 返回基础响应
            return CheckResponse(
                diffs=[DiffSegment(type='equal', value=original_text)],
                issues=[],
                corrected_text=original_text
            )

    def _parse_polish_response(self, ai_response: str, original_text: str) -> PolishResponse:
        """
        解析润色响应

        Args:
            ai_response: AI响应
            original_text: 原始文本

        Returns:
            润色结果
        """
        try:
            # 使用JSON解析方法
            response_data = self._extract_json_from_response(ai_response)

            if "error" in response_data:
                # JSON解析失败，返回原文本和友好的错误提示
                polished_text = original_text
                changes = [
                    PolishChange(
                        type="system",
                        description="AI服务响应格式异常，无法解析润色结果",
                        reason="请重试或联系管理员检查AI服务配置",
                        start=0,
                        end=len(original_text),
                        originalText=original_text,
                        polishedText=original_text,
                        confidence=0.0
                    )
                ]
            else:
                # 成功解析JSON
                polished_text = response_data.get("polishedText", original_text)
                changes = response_data.get("changes", [])

            # 计算差异
            diffs = self._calculate_diff(original_text, polished_text)

            # 将changes转换为PolishChange对象
            polish_changes = []
            for change in changes:
                polish_changes.append(PolishChange(
                    type=change.get("type", "polish"),
                    description=change.get("description", ""),
                    original_text=change.get("originalText", ""),
                    polished_text=change.get("polishedText", ""),
                    reason=change.get("reason", "")
                ))

            return PolishResponse(
                diffs=diffs,
                polished_text=polished_text,
                changes=polish_changes
            )

        except Exception as e:
            logger.error(f"Failed to parse polish response: {str(e)}")
            # 返回基础响应
            return PolishResponse(
                diffs=[DiffSegment(type='equal', value=original_text)],
                polished_text=original_text
            )

    def _parse_translate_response(self, ai_response: str, request: TranslateRequest) -> TranslateResponse:
        """
        解析翻译响应

        Args:
            ai_response: AI响应
            request: 翻译请求

        Returns:
            翻译结果
        """
        try:
            # 使用JSON解析方法
            response_data = self._extract_json_from_response(ai_response)

            if "error" in response_data:
                # JSON解析失败，返回友好的错误提示
                translated_text = "翻译服务暂时不可用，请稍后重试"
            else:
                # 成功解析JSON
                translated_text = response_data.get("translatedText", ai_response.strip())

            # 计算差异
            diffs = self._calculate_diff(request.text, translated_text)

            return TranslateResponse(
                diffs=diffs,
                translated_text=translated_text,
                source_language=request.language or "auto",
                target_language=request.target_language
            )

        except Exception as e:
            logger.error(f"Failed to parse translate response: {str(e)}")
            # 返回基础响应
            return TranslateResponse(
                diffs=[DiffSegment(type='equal', value=request.text)],
                translated_text=request.text,
                source_language=request.language or "auto",
                target_language=request.target_language
            )

    def _parse_rewrite_response(self, ai_response: str, request: RewriteRequest, user_id: str) -> RewriteResponse:
        """
        解析改写响应

        Args:
            ai_response: AI响应
            request: 改写请求
            user_id: 用户ID

        Returns:
            改写结果
        """
        try:
            # 使用JSON解析方法
            response_data = self._extract_json_from_response(ai_response)

            if "error" in response_data:
                # JSON解析失败，返回友好的错误提示
                rewritten_text = "改写服务暂时不可用，请稍后重试"
            else:
                # 成功解析JSON
                rewritten_text = response_data.get("rewrittenText", ai_response.strip())

            # 计算差异
            diffs = self._calculate_diff(request.text, rewritten_text)

            # 生成对话ID
            conversation_id = f"{user_id}_{len(request.conversation_history)}"

            return RewriteResponse(
                diffs=diffs,
                rewritten_text=rewritten_text,
                conversation_id=conversation_id
            )

        except Exception as e:
            logger.error(f"Failed to parse rewrite response: {str(e)}")
            # 返回基础响应
            return RewriteResponse(
                diffs=[DiffSegment(type='equal', value=request.text)],
                rewritten_text=request.text,
                conversation_id=f"{user_id}_error"
            )


# 创建全局实例
ai_proxy_service = AIProxyService()
