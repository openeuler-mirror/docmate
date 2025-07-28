from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class TextRequest(BaseModel):
    """
    文本处理请求基础模型
    """
    text: str = Field(..., description="要处理的文本")
    language: Optional[str] = Field("auto", description="文本语言")


class CheckRequest(TextRequest):
    """
    文本检查请求模型
    """
    enable_grammar: bool = Field(True, description="启用语法检查")
    enable_style: bool = Field(True, description="启用风格检查")
    enable_terminology: bool = Field(True, description="启用术语检查")
    enable_consistency: bool = Field(True, description="启用一致性检查")
    strict_mode: bool = Field(False, description="严格模式")


class PolishRequest(TextRequest):
    """
    文本润色请求模型
    """
    target_audience: Optional[str] = Field(None, description="目标受众")
    focus_on: Optional[str] = Field(None, description="重点关注方面")


class TranslateRequest(TextRequest):
    """
    文本翻译请求模型
    """
    target_language: str = Field(..., description="目标语言")
    preserve_terminology: bool = Field(True, description="保留术语")


class RewriteRequest(TextRequest):
    """
    文本改写请求模型
    """
    instruction: str = Field(..., description="改写指令")
    conversation_history: List[Dict[str, Any]] = Field(default=[], description="对话历史")


class DiffSegment(BaseModel):
    """
    文本差异片段
    """
    type: str = Field(..., description="差异类型: equal, insert, delete")
    value: str = Field(..., description="文本内容")


class CheckIssue(BaseModel):
    """
    检查发现的问题
    """
    message: str = Field(..., description="问题描述")
    suggestion: str = Field(..., description="修改建议")
    range: List[int] = Field(..., description="问题位置范围 [start, end]")
    severity: str = Field("warning", description="严重程度: error, warning, info")
    category: str = Field("general", description="问题类别")


class CheckResponse(BaseModel):
    """
    文本检查响应模型
    """
    diffs: List[DiffSegment] = Field(..., description="文本差异")
    issues: List[CheckIssue] = Field(..., description="发现的问题")
    corrected_text: Optional[str] = Field(None, description="修正后的文本")


class PolishChange(BaseModel):
    """
    润色修改项
    """
    type: str = Field(..., description="修改类型")
    description: str = Field(..., description="修改说明")
    original_text: str = Field(..., description="原文片段")
    polished_text: str = Field(..., description="润色后片段")
    reason: str = Field(..., description="修改原因")

class PolishResponse(BaseModel):
    """
    文本润色响应模型
    """
    diffs: List[DiffSegment] = Field(..., description="文本差异")
    polished_text: str = Field(..., description="润色后的文本")
    changes: Optional[List[PolishChange]] = Field(default=[], description="详细修改说明")


class TranslateResponse(BaseModel):
    """
    文本翻译响应模型
    """
    diffs: List[DiffSegment] = Field(..., description="文本差异")
    translated_text: str = Field(..., description="翻译后的文本")
    source_language: str = Field(..., description="源语言")
    target_language: str = Field(..., description="目标语言")


class RewriteResponse(BaseModel):
    """
    文本改写响应模型
    """
    diffs: List[DiffSegment] = Field(..., description="文本差异")
    rewritten_text: str = Field(..., description="改写后的文本")
    conversation_id: str = Field(..., description="对话ID")


class APIError(BaseModel):
    """
    API错误响应模型
    """
    error: str = Field(..., description="错误类型")
    message: str = Field(..., description="错误消息")
    details: Optional[Dict[str, Any]] = Field(None, description="错误详情")
