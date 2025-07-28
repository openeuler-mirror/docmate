"""
文本检查相关的Prompt模板
"""

def build_check_prompt(text: str, check_types: list, strict_mode: bool = False) -> str:
    """
    构建文本检查提示词，要求返回JSON格式
    
    Args:
        text: 要检查的文本
        check_types: 检查类型列表
        strict_mode: 是否使用严格模式
        
    Returns:
        格式化的prompt字符串
    """
    check_list = "、".join(check_types) if check_types else "全面"
    strictness = "严格" if strict_mode else "标准"
    
    prompt = f"""请对以下技术文档进行{strictness}级别的{check_list}检查。

文档内容：
{text}

检查要求：
1. 语法和拼写错误
2. 术语使用规范（特别是openEuler相关术语）
3. 表达清晰度和准确性
4. 内容逻辑一致性
5. 技术描述的准确性

请严格按照以下JSON格式返回检查结果，不要包含任何其他文字：

{{
  "correctedText": "修正后的完整文本",
  "issues": [
    {{
      "type": "grammar|terminology|style|consistency",
      "severity": "error|warning|info",
      "message": "问题描述",
      "suggestion": "修改建议",
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "原文本片段",
      "suggestedText": "建议文本片段",
      "confidence": 0.95
    }}
  ]
}}

注意：
1. 只返回JSON格式，不要包含其他文字
2. correctedText字段必须包含修正后的完整文本
3. 位置索引从0开始
4. 置信度范围0.0-1.0
5. 如果没有发现问题，issues数组为空，但correctedText仍需提供"""
    
    return prompt


def build_terminology_check_prompt(text: str) -> str:
    """
    构建术语检查提示词
    
    Args:
        text: 要检查的文本
        
    Returns:
        格式化的prompt字符串
    """
    prompt = f"""请检查以下文本中的术语使用是否规范，特别关注openEuler相关术语：

文本：
{text}

检查重点：
1. openEuler术语的正确拼写和大小写（应为"openEuler"而不是"OpenEuler"或"Open Euler"）
2. 技术术语的一致性
3. 专业术语的准确性

请按照以下JSON格式返回检查结果：

{{
  "correctedText": "修正后的完整文本",
  "issues": [
    {{
      "type": "terminology",
      "severity": "error|warning|info",
      "message": "术语问题描述",
      "suggestion": "正确的术语用法",
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "错误的术语",
      "suggestedText": "正确的术语",
      "confidence": 0.95
    }}
  ]
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt
