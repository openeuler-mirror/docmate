/**
 * 翻译相关的Prompt模板
 */

/**
 * 语言名称映射
 */
const LANGUAGE_NAMES = {
  'zh-CN': '中文',
  'zh': '中文',
  'en-US': '英文',
  'en': '英文',
  'ja': '日文',
  'ko': '韩文',
  'fr': '法文',
  'de': '德文',
  'es': '西班牙文',
  'ru': '俄文',
  'auto': '自动检测'
} as const;

/**
 * 构建翻译提示词
 */
export function buildTranslatePrompt(
  text: string,
  sourceLanguage: string = 'auto',
  targetLanguage: string = 'en',
  preserveTerminology: boolean = true,
  context: string = ''
): string {
  const sourceLangName = LANGUAGE_NAMES[sourceLanguage as keyof typeof LANGUAGE_NAMES] || sourceLanguage;
  const targetLangName = LANGUAGE_NAMES[targetLanguage as keyof typeof LANGUAGE_NAMES] || targetLanguage;
  
  const contextSection = context ? `\n上下文信息：${context}\n` : '';
  const terminologyNote = preserveTerminology ? '保持技术术语不变' : '可以适当本地化专业术语';
  
  return `请将以下技术文档从${sourceLangName}翻译为${targetLangName}。${contextSection}
原文：
${text}

翻译要求：
1. 保持技术文档的专业性和准确性
2. ${terminologyNote}
3. 确保翻译自然流畅
4. 保持原文的格式和结构
5. 适应目标语言的表达习惯
6. 特别注意openEuler术语的正确使用

请按照以下JSON格式返回翻译结果：

{
  "translatedText": "翻译后的完整文本",
  "sourceLanguage": "${sourceLangName}",
  "targetLanguage": "${targetLangName}",
  "terminology": [
    {
      "original": "原文中的专业术语",
      "translated": "翻译后的对应术语",
      "note": "翻译说明或保持原文的原因"
    }
  ]
}

重要要求：
1. translatedText必须包含完整的翻译文本
2. terminology数组必须包含文本中出现的所有重要专业术语
3. 即使术语保持不变，也要在terminology中列出
4. 每个术语都要提供翻译说明
5. 只返回JSON格式，不要包含其他解释文字`;
}

/**
 * 构建全文档翻译提示词
 */
export function buildFullDocumentTranslatePrompt(
  text: string,
  sourceLanguage: string = 'auto',
  targetLanguage: string = 'en',
  preserveTerminology: boolean = true
): string {
  const sourceLangName = LANGUAGE_NAMES[sourceLanguage as keyof typeof LANGUAGE_NAMES] || sourceLanguage;
  const targetLangName = LANGUAGE_NAMES[targetLanguage as keyof typeof LANGUAGE_NAMES] || targetLanguage;
  
  const terminologyNote = preserveTerminology ? '保持技术术语不变' : '可以适当本地化专业术语';
  
  return `请将以下完整技术文档从${sourceLangName}翻译为${targetLangName}。

原文档：
${text}

翻译要求：
1. 保持文档的完整结构和格式
2. 确保技术术语的准确性和一致性
3. ${terminologyNote}
4. 保持专业的技术写作风格
5. 确保翻译的连贯性和流畅性
6. 特别注意openEuler相关术语的正确使用

请按照以下JSON格式返回翻译结果：

{
  "translatedText": "翻译后的完整文档",
  "sourceLanguage": "${sourceLanguage}",
  "targetLanguage": "${targetLanguage}",
  "sections": [
    {
      "title": "章节标题",
      "originalText": "原文片段",
      "translatedText": "翻译后片段"
    }
  ],
  "terminology": [
    {
      "original": "原术语",
      "translated": "翻译后术语",
      "note": "翻译说明"
    }
  ]
}

只返回JSON格式，不要包含其他文字。`;
}
