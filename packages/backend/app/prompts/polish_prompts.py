"""
文本润色相关的Prompt模板
"""

def build_polish_prompt(text: str, focus_on: str = "all", target_audience: str = "technical") -> str:
    """
    构建文本润色提示词
    
    Args:
        text: 要润色的文本
        focus_on: 润色重点 (clarity|conciseness|tone|structure|all)
        target_audience: 目标读者 (technical|general|beginner|expert)
        
    Returns:
        格式化的prompt字符串
    """
    focus_descriptions = {
        "clarity": "提高表达的清晰度和准确性",
        "conciseness": "使表达更加简洁明了",
        "tone": "调整语调和表达方式",
        "structure": "优化文档结构和逻辑",
        "all": "全面提升文档质量"
    }
    
    audience_descriptions = {
        "technical": "技术人员",
        "general": "一般用户",
        "beginner": "初学者",
        "expert": "专家用户"
    }
    
    focus_description = focus_descriptions.get(focus_on, "全面提升文档质量")
    audience_description = audience_descriptions.get(target_audience, "技术人员")
    
    prompt = f"""请对以下技术文档进行全面润色，重点{focus_description}，目标读者是{audience_description}。

注意：请保持技术术语的准确性，不要随意更改专业术语。

原文：
{text}

润色要求：
1. 提高表达的清晰度和准确性
2. 优化文档结构和逻辑
3. 确保技术描述准确无误
4. 保持专业的技术写作风格
5. 提升可读性和用户体验
6. 保持原文的核心意思和重要信息

请按照以下JSON格式返回润色结果：

{{
  "polishedText": "润色后的完整文本",
  "changes": [
    {{
      "type": "clarity|conciseness|tone|structure|grammar",
      "description": "修改说明",
      "originalText": "原文片段",
      "polishedText": "润色后片段",
      "reason": "修改原因"
    }}
  ]
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt


def build_clarity_polish_prompt(text: str) -> str:
    """
    构建清晰度润色提示词
    
    Args:
        text: 要润色的文本
        
    Returns:
        格式化的prompt字符串
    """
    prompt = f"""请重点提高以下技术文档的清晰度：

原文：
{text}

要求：
1. 简化复杂的表达
2. 明确模糊的描述
3. 优化句子结构
4. 保持技术准确性

请按照以下JSON格式返回润色结果：

{{
  "polishedText": "润色后的完整文本",
  "improvements": [
    {{
      "type": "clarity",
      "description": "清晰度改进说明",
      "before": "原始表达",
      "after": "改进后表达"
    }}
  ]
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt
