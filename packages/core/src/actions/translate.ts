import { TranslateResultItem, TranslateResult, FullTranslateResult, generateId, createError, LANGUAGES } from '@docmate/shared';
import { AIService } from '../services/AIService';
import { IAction, IGenericAction, ActionExecuteOptions } from './BaseAction';
import { calculateDiff } from '../utils/diff';
import { PromptBuilder } from '../prompts';

export interface TranslateOptions {
  sourceLanguage?: string;
  targetLanguage: string;
  preserveTerminology?: boolean;
  includeAlternatives?: boolean;
  context?: string;
}

export class TranslateAction implements IAction<TranslateResult> {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  async execute(options: ActionExecuteOptions & { translateOptions: TranslateOptions }): Promise<TranslateResult> {
    const { text, translateOptions } = options;

    if (!text.trim()) {
      return {
        diffs: [],
        sourceLang: translateOptions.sourceLanguage || 'auto',
        targetLang: translateOptions.targetLanguage
      };
    }

    if (!translateOptions.targetLanguage) {
      throw createError(
        'TRANSLATE_MISSING_TARGET',
        'Target language is required for translation'
      );
    }

    if (!this.aiService.validateConfig()) {
      throw createError(
        'AI_CONFIG_INVALID',
        'AI service configuration is invalid'
      );
    }

    try {
      const prompt = createTranslatePrompt(text, translateOptions);
      const response = await this.aiService.generate(prompt);

      if (!response.success) {
        throw createError(
          'TRANSLATE_AI_FAILED',
          response.error?.message || 'AI service failed'
        );
      }

      // 提取翻译后的文本
      const translatedText = this.extractTranslatedText(response.content);

      // 计算diff
      const diffs = calculateDiff(text, translatedText);

      return {
        diffs,
        sourceLang: translateOptions.sourceLanguage || 'auto',
        targetLang: translateOptions.targetLanguage,
      };
    } catch (error) {
      throw createError(
        'TRANSLATE_FAILED',
        'Failed to translate text',
        { originalError: error }
      );
    }
  }

  /**
   * 从AI响应中提取翻译后的文本
   */
  private extractTranslatedText(response: string): string {
    // 尝试解析JSON格式的响应
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.translatedText) {
          return data.translatedText;
        }
        if (data.translation) {
          return data.translation;
        }
      }
    } catch (error) {
      // JSON解析失败，直接返回响应内容
    }

    // 如果不是JSON格式，直接返回响应内容
    return response.trim();
  }
}

// 保持向后兼容的函数
export async function execute(
  text: string,
  aiService: AIService,
  options: TranslateOptions
): Promise<TranslateResultItem[]> {
  const action = new TranslateAction(aiService);
  const result = await action.execute({ text, translateOptions: options });

  // 从新格式转换为旧格式以保持兼容性
  return [{
    id: generateId(),
    originalText: text,
    translatedText: result.diffs.filter(d => d.type !== 'delete').map(d => d.value).join(''),
    sourceLanguage: result.sourceLang,
    targetLanguage: result.targetLang,
    confidence: 0.9,
    range: {
      start: 0,
      end: text.length,
    },
  }];
}

/**
 * 创建翻译提示词
 */
function createTranslatePrompt(text: string, options: TranslateOptions): string {
  return PromptBuilder.buildTranslatePrompt(text, {
    sourceLanguage: options.sourceLanguage,
    targetLanguage: options.targetLanguage,
    preserveTerminology: options.preserveTerminology,
    context: options.context
  });
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

/**
 * 全文翻译Action - 不使用diff格式，直接返回翻译文本
 */
export class FullTranslateAction implements IGenericAction<FullTranslateResult> {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  async execute(options: ActionExecuteOptions & {
    translateOptions: TranslateOptions;
    fileName?: string;
  }): Promise<FullTranslateResult> {
    const { text, translateOptions, fileName } = options;

    if (!text.trim()) {
      return {
        translatedText: '',
        sourceLang: translateOptions.sourceLanguage || 'auto',
        targetLang: translateOptions.targetLanguage,
        originalFileName: fileName,
        suggestedFileName: this.generateTranslatedFileName(fileName, translateOptions.targetLanguage)
      };
    }

    if (!translateOptions.targetLanguage) {
      throw createError(
        'TRANSLATE_MISSING_TARGET',
        'Target language is required for translation'
      );
    }

    if (!this.aiService.validateConfig()) {
      throw createError(
        'AI_CONFIG_INVALID',
        'AI service configuration is invalid'
      );
    }

    try {
      console.log('FullTranslateAction: Starting translation with options:', translateOptions);

      // 使用专门的全文翻译prompt
      const prompt = this.createFullTranslatePrompt(text, translateOptions);
      console.log('FullTranslateAction: Generated prompt:', prompt.substring(0, 200) + '...');

      const response = await this.aiService.generate(prompt);
      console.log('FullTranslateAction: AI response received:', response);

      if (!response.success) {
        console.error('FullTranslateAction: AI service failed:', response.error);
        throw createError(
          'TRANSLATE_AI_FAILED',
          response.error?.message || 'AI service failed'
        );
      }

      // 直接使用AI返回的翻译文本
      const translatedText = response.content.trim();
      console.log('FullTranslateAction: Translation completed, length:', translatedText.length);

      return {
        translatedText,
        sourceLang: translateOptions.sourceLanguage || 'auto',
        targetLang: translateOptions.targetLanguage,
        originalFileName: fileName,
        suggestedFileName: this.generateTranslatedFileName(fileName, translateOptions.targetLanguage)
      };
    } catch (error) {
      throw createError(
        'TRANSLATE_FAILED',
        'Failed to translate text',
        { originalError: error }
      );
    }
  }

  /**
   * 创建全文翻译提示词
   */
  private createFullTranslatePrompt(text: string, options: TranslateOptions): string {
    return PromptBuilder.buildTranslatePrompt(text, {
      sourceLanguage: options.sourceLanguage,
      targetLanguage: options.targetLanguage,
      preserveTerminology: options.preserveTerminology,
      context: options.context
    });
  }

  /**
   * 生成翻译后的文件名
   */
  private generateTranslatedFileName(originalFileName?: string, targetLanguage?: string): string {
    if (!originalFileName) {
      return `translated_document_${targetLanguage || 'en'}.md`;
    }

    const lastDotIndex = originalFileName.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? originalFileName.substring(0, lastDotIndex) : originalFileName;
    const extension = lastDotIndex > 0 ? originalFileName.substring(lastDotIndex) : '.md';

    // 根据目标语言添加后缀
    const languageSuffix = this.getLanguageSuffix(targetLanguage || 'en');

    return `${nameWithoutExt}_${languageSuffix}${extension}`;
  }

  /**
   * 获取语言后缀
   */
  private getLanguageSuffix(languageCode: string): string {
    const suffixMap: Record<string, string> = {
      'en-US': 'en',
      'en': 'en',
      'zh-CN': 'zh',
      'zh': 'zh',
      'ja': 'ja',
      'ko': 'ko',
      'fr': 'fr',
      'de': 'de',
      'es': 'es',
      'ru': 'ru',
    };

    return suffixMap[languageCode] || languageCode.toLowerCase();
  }
}
