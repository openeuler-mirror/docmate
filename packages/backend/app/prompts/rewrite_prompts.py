"""
改写相关的Prompt模板
"""

def build_rewrite_prompt(original_text: str, user_instruction: str, preserve_terminology: bool = True) -> str:
    """
    构建改写提示词
    
    Args:
        original_text: 原始文本
        user_instruction: 用户指令
        preserve_terminology: 是否保持术语不变
        
    Returns:
        格式化的prompt字符串
    """
    terminology_note = "\n\n特别注意：请保持技术术语的准确性，不要随意更改专业术语。" if preserve_terminology else ""
    
    prompt = f"""你是一个专业的文档改写助手。你的任务是根据用户的指令对文本进行改写。

改写要求：
1. 保持原文的核心意思和重要信息
2. 根据用户的具体指令进行调整
3. 确保改写后的文本流畅、准确、易读
4. 如果用户没有特殊要求，保持原文的格式和结构
5. 对于技术文档，保持专业术语的准确性{terminology_note}

当前需要改写的原文：
{original_text}

用户指令：{user_instruction}

请按照以下JSON格式返回改写结果：

{{
  "rewrittenText": "改写后的完整文本",
  "changes": [
    {{
      "type": "content|structure|style|tone",
      "description": "修改说明",
      "originalText": "原文片段",
      "rewrittenText": "改写后片段",
      "reason": "改写原因"
    }}
  ],
  "summary": "改写总结说明"
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt


def build_style_rewrite_prompt(text: str, requirements: str) -> str:
    """
    构建风格改写提示词
    
    Args:
        text: 要改写的文本
        requirements: 改写要求
        
    Returns:
        格式化的prompt字符串
    """
    prompt = f"""请根据以下要求改写文本：

原文：
{text}

改写要求：{requirements}

请按照以下JSON格式返回改写结果：

{{
  "rewrittenText": "改写后的完整文本",
  "styleChanges": [
    {{
      "aspect": "改写方面",
      "description": "具体改动说明",
      "before": "改写前",
      "after": "改写后"
    }}
  ]
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt
