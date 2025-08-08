/**
// 重要：本助手面向 openEuler 文档写作场景，你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。

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

  return `你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。
请将以下技术文档从${sourceLangName}翻译为${targetLangName}。${contextSection}

翻译要求：
1. 保持文档的完整结构和格式
2. 确保技术术语的准确性和一致性
3. ${terminologyNote}
4. 保持专业的技术写作风格
5. 确保翻译的连贯性和流畅性
6. 特别注意openEuler相关术语的正确使用

【原文】
${text}

重要：你必须仅通过调用函数 return_translate_result 返回结构化结果；不得输出任何其它文本、思考、解释或Markdown代码块。
请确保以下字段必须出现：
- translatedText（完整翻译文本）
- sourceLanguage/targetLanguage
- terminology（数组，列出主要术语对照，如无术语请返回空数组而不是省略字段）。`;
}
