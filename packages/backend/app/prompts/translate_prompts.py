"""
翻译相关的Prompt模板
"""

def build_translate_prompt(text: str, source_language: str = "auto", target_language: str = "en", 
                          preserve_terminology: bool = True, context: str = "") -> str:
    """
    构建翻译提示词
    
    Args:
        text: 要翻译的文本
        source_language: 源语言
        target_language: 目标语言
        preserve_terminology: 是否保持术语不变
        context: 上下文信息
        
    Returns:
        格式化的prompt字符串
    """
    language_names = {
        "zh-CN": "中文",
        "zh": "中文", 
        "en-US": "英文",
        "en": "英文",
        "ja": "日文",
        "ko": "韩文",
        "fr": "法文",
        "de": "德文",
        "es": "西班牙文",
        "ru": "俄文",
        "auto": "自动检测"
    }
    
    source_lang_name = language_names.get(source_language, source_language)
    target_lang_name = language_names.get(target_language, target_language)
    
    context_section = f"\n上下文信息：{context}\n" if context else ""
    
    terminology_note = "保持技术术语不变" if preserve_terminology else "可以适当本地化专业术语"
    
    prompt = f"""请将以下技术文档从{source_lang_name}翻译为{target_lang_name}。
{context_section}
原文：
{text}

翻译要求：
1. 保持技术文档的专业性和准确性
2. {terminology_note}
3. 确保翻译自然流畅
4. 保持原文的格式和结构
5. 适应目标语言的表达习惯
6. 特别注意openEuler术语的正确使用

请按照以下JSON格式返回翻译结果：

{{
  "translatedText": "翻译后的完整文本",
  "sourceLanguage": "{source_language}",
  "targetLanguage": "{target_language}",
  "terminology": [
    {{
      "original": "原术语",
      "translated": "翻译后术语",
      "note": "翻译说明"
    }}
  ]
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt


def build_full_document_translate_prompt(text: str, target_language: str = "en") -> str:
    """
    构建完整文档翻译提示词
    
    Args:
        text: 要翻译的完整文档
        target_language: 目标语言
        
    Returns:
        格式化的prompt字符串
    """
    language_names = {
        "zh-CN": "中文",
        "zh": "中文",
        "en-US": "英文", 
        "en": "英文",
        "ja": "日文",
        "ko": "韩文"
    }
    
    target_lang_name = language_names.get(target_language, target_language)
    
    prompt = f"""请将以下完整的技术文档翻译为{target_lang_name}：

原文档：
{text}

翻译要求：
1. 完整翻译所有内容
2. 保持文档结构和格式
3. 确保技术术语准确
4. 保持专业性和可读性
5. 适合{target_lang_name}读者阅读
6. 保持openEuler等专有名词不变

请按照以下JSON格式返回翻译结果：

{{
  "translatedDocument": "翻译后的完整文档",
  "targetLanguage": "{target_language}",
  "summary": "翻译摘要说明"
}}

只返回JSON格式，不要包含其他文字。"""
    
    return prompt
