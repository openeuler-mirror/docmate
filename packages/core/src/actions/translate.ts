import { TranslateResultItem, generateId, createError, LANGUAGES } from '@docmate/shared';
import { AIService } from '../services/AIService';

export interface TranslateOptions {
  sourceLanguage?: string;
  targetLanguage: string;
  preserveTerminology?: boolean;
  includeAlternatives?: boolean;
  context?: string;
}

export async function execute(
  text: string,
  aiService: AIService,
  options: TranslateOptions
): Promise<TranslateResultItem[]> {
  if (!text.trim()) {
    return [];
  }

  if (!options.targetLanguage) {
    throw createError(
      'TRANSLATE_MISSING_TARGET',
      'Target language is required for translation'
    );
  }

  if (!aiService.validateConfig()) {
    throw createError(
      'AI_CONFIG_INVALID',
      'AI service configuration is invalid'
    );
  }

  try {
    const prompt = createTranslatePrompt(text, options);
    const response = await aiService.generate(prompt);
    return parseTranslateResponse(response.content, text, options);
  } catch (error) {
    throw createError(
      'TRANSLATE_FAILED',
      'Failed to translate text',
      { originalError: error }
    );
  }
}

/**
 * 创建翻译提示词
 */
function createTranslatePrompt(text: string, options: TranslateOptions): string {
  const sourceLanguage = options.sourceLanguage || 'auto-detect';
  const targetLanguage = getLanguageName(options.targetLanguage);
  const preserveTerms = options.preserveTerminology !== false;
  const includeAlternatives = options.includeAlternatives === true;
  const context = options.context || '';

  let contextSection = '';
  if (context) {
    contextSection = `\n上下文信息：${context}\n`;
  }

  return `请将以下技术文档从${sourceLanguage === 'auto-detect' ? '源语言' : getLanguageName(sourceLanguage)}翻译为${targetLanguage}。

${contextSection}
原文：
"""
${text}
"""

翻译要求：
1. 保持技术文档的专业性和准确性
2. ${preserveTerms ? '保持openEuler、Linux、RPM等专业术语不变' : '可以适当本地化专业术语'}
3. 确保翻译自然流畅
4. 保持原文的格式和结构
${includeAlternatives ? '5. 为关键词句提供备选翻译' : ''}

请以JSON格式返回翻译结果，格式如下：
{
  "translations": [
    {
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "原文本",
      "translatedText": "翻译文本",
      "sourceLanguage": "源语言代码",
      "targetLanguage": "目标语言代码",
      "confidence": 0.0-1.0${includeAlternatives ? ',\n      "alternatives": ["备选翻译1", "备选翻译2"]' : ''}
    }
  ]
}

注意：
1. 只返回JSON格式，不要包含其他文字
2. 位置索引从0开始
3. 置信度范围0.0-1.0
4. 语言代码使用ISO 639-1标准（如zh-CN, en-US）`;
}

/**
 * 解析翻译响应
 */
function parseTranslateResponse(
  response: string,
  originalText: string,
  options: TranslateOptions
): TranslateResultItem[] {
  try {
    // 提取JSON部分
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in translate response');
      // 如果没有找到JSON，尝试将整个响应作为翻译结果
      return [{
        id: generateId(),
        originalText,
        translatedText: response.trim(),
        sourceLanguage: options.sourceLanguage || 'auto',
        targetLanguage: options.targetLanguage,
        confidence: 0.7,
        range: {
          start: 0,
          end: originalText.length,
        },
      }];
    }

    const data = JSON.parse(jsonMatch[0]);
    
    if (!data.translations || !Array.isArray(data.translations)) {
      console.warn('Invalid translate response format');
      return [];
    }

    const results: TranslateResultItem[] = [];

    for (const translation of data.translations) {
      // 验证必需字段
      if (!translation.originalText || !translation.translatedText) {
        continue;
      }

      // 验证范围
      if (typeof translation.start !== 'number' || typeof translation.end !== 'number') {
        continue;
      }

      if (translation.start < 0 || translation.end > originalText.length || translation.start >= translation.end) {
        continue;
      }

      // 验证原文本是否匹配
      const actualOriginalText = originalText.substring(translation.start, translation.end);
      if (actualOriginalText.trim() !== translation.originalText.trim()) {
        // 尝试在附近查找匹配的文本
        const foundIndex = originalText.indexOf(translation.originalText, Math.max(0, translation.start - 50));
        if (foundIndex !== -1) {
          translation.start = foundIndex;
          translation.end = foundIndex + translation.originalText.length;
        } else {
          continue; // 跳过无法匹配的项
        }
      }

      results.push({
        id: generateId(),
        originalText: translation.originalText,
        translatedText: translation.translatedText,
        sourceLanguage: translation.sourceLanguage || options.sourceLanguage || 'auto',
        targetLanguage: translation.targetLanguage || options.targetLanguage,
        confidence: Math.max(0, Math.min(1, translation.confidence || 0.8)),
        alternatives: translation.alternatives || undefined,
        range: {
          start: translation.start,
          end: translation.end,
        },
      });
    }

    return results.sort((a, b) => a.range.start - b.range.start);
  } catch (error) {
    console.warn('Failed to parse translate response:', error);
    return [];
  }
}

/**
 * 获取语言名称
 */
function getLanguageName(languageCode: string): string {
  const languageNames: Record<string, string> = {
    [LANGUAGES.ZH_CN]: '中文',
    [LANGUAGES.EN_US]: 'English',
    'zh': '中文',
    'en': 'English',
    'ja': '日语',
    'ko': '韩语',
    'fr': '法语',
    'de': '德语',
    'es': '西班牙语',
    'ru': '俄语',
  };

  return languageNames[languageCode] || languageCode;
}

/**
 * 应用翻译
 */
export function applyTranslation(originalText: string, translateItem: TranslateResultItem): string {
  const { range, translatedText } = translateItem;
  
  return (
    originalText.substring(0, range.start) +
    translatedText +
    originalText.substring(range.end)
  );
}

/**
 * 批量应用翻译
 */
export function applyMultipleTranslations(
  originalText: string,
  translateItems: TranslateResultItem[]
): string {
  // 按位置倒序排列，从后往前应用，避免位置偏移
  const sortedItems = [...translateItems].sort((a, b) => b.range.start - a.range.start);
  
  let result = originalText;
  
  for (const item of sortedItems) {
    result = applyTranslation(result, item);
  }
  
  return result;
}

/**
 * 检测语言
 */
export async function detectLanguage(text: string, aiService: AIService): Promise<string> {
  if (!text.trim()) {
    return 'unknown';
  }

  try {
    const prompt = `请检测以下文本的语言，只返回语言代码（如zh-CN, en-US）：

"""
${text.substring(0, 200)}
"""`;

    const response = await aiService.generate(prompt);
    const detectedLanguage = response.content.trim().toLowerCase();
    
    // 验证返回的语言代码
    const validLanguages = [LANGUAGES.ZH_CN, LANGUAGES.EN_US, 'zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru'];
    
    if (validLanguages.includes(detectedLanguage)) {
      return detectedLanguage;
    }
    
    // 尝试从响应中提取语言代码
    const languageMatch = response.content.match(/\b(zh-cn|en-us|zh|en|ja|ko|fr|de|es|ru)\b/i);
    if (languageMatch) {
      return languageMatch[1].toLowerCase();
    }
    
    return 'unknown';
  } catch (error) {
    console.warn('Language detection failed:', error);
    return 'unknown';
  }
}
