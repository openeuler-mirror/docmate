import { PolishResultItem, PolishResult, generateId, createError } from '@docmate/shared';
import { AIService } from '../services/AIService';
import { IAction, ActionExecuteOptions, BaseActionResult } from './BaseAction';
import { calculateDiff } from '../utils/diff';
import { PromptBuilder } from '../prompts';

export interface PolishOptions {
  focusOn?: 'clarity' | 'conciseness' | 'tone' | 'structure' | 'all';
  targetAudience?: 'technical' | 'general' | 'beginner' | 'expert';
  preserveTerminology?: boolean;
  maxLength?: number;
}

export class PolishAction implements IAction<PolishResult> {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  async execute(options: ActionExecuteOptions & { polishOptions?: PolishOptions }): Promise<PolishResult> {
    const { text, polishOptions = {} } = options;

    if (!text.trim()) {
      return { diffs: [] };
    }

    if (!this.aiService.validateConfig()) {
      throw createError(
        'AI_CONFIG_INVALID',
        'AI service configuration is invalid'
      );
    }

    try {
      const prompt = createPolishPrompt(text, polishOptions);
      const response = await this.aiService.generate(prompt);

      if (!response.success) {
        throw createError(
          'POLISH_AI_FAILED',
          response.error?.message || 'AI service failed'
        );
      }

      // 解析AI响应获取润色后的文本
      const polishedText = this.extractPolishedText(response.content, text);

      // 计算diff
      const diffs = calculateDiff(text, polishedText);

      return { diffs };
    } catch (error) {
      throw createError(
        'POLISH_FAILED',
        'Failed to polish text',
        { originalError: error }
      );
    }
  }

  /**
   * 从AI响应中提取润色后的文本
   */
  private extractPolishedText(response: string, originalText: string): string {
    // 尝试解析JSON格式的响应
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        if (data.polishedText) {
          return data.polishedText;
        }

        // 如果是分段润色的格式，重新组装文本
        if (data.polishes && Array.isArray(data.polishes)) {
          return this.reconstructTextFromPolishes(originalText, data.polishes);
        }
      }
    } catch (error) {
      // JSON解析失败，尝试其他方法
    }

    // 如果不是JSON格式，直接返回响应内容
    return response.trim();
  }

  /**
   * 从分段润色结果重新组装文本
   */
  private reconstructTextFromPolishes(originalText: string, polishes: any[]): string {
    let result = originalText;

    // 按位置倒序排列，从后往前应用，避免位置偏移
    const sortedPolishes = polishes
      .filter(p => p.originalText && p.polishedText && typeof p.start === 'number' && typeof p.end === 'number')
      .sort((a, b) => b.start - a.start);

    for (const polish of sortedPolishes) {
      if (polish.start >= 0 && polish.end <= result.length && polish.start < polish.end) {
        result = result.substring(0, polish.start) + polish.polishedText + result.substring(polish.end);
      }
    }

    return result;
  }
}

// 保持向后兼容的函数
export async function execute(
  text: string,
  aiService: AIService,
  options: PolishOptions = {}
): Promise<PolishResultItem[]> {
  const action = new PolishAction(aiService);
  const result = await action.execute({ text, polishOptions: options });

  // 将新格式转换为旧格式以保持兼容性
  return parsePolishResponse(JSON.stringify({ polishes: [] }), text);
}

/**
 * 创建润色提示词
 */
function createPolishPrompt(text: string, options: PolishOptions): string {
  return PromptBuilder.buildPolishPrompt(text, {
    focusOn: options.focusOn,
    targetAudience: options.targetAudience,
    preserveTerminology: options.preserveTerminology
  });
}

/**
 * 解析润色响应
 */
function parsePolishResponse(response: string, originalText: string): PolishResultItem[] {
  try {
    // 提取JSON部分
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in polish response');
      return [];
    }

    const data = JSON.parse(jsonMatch[0]);
    
    if (!data.polishes || !Array.isArray(data.polishes)) {
      console.warn('Invalid polish response format');
      return [];
    }

    const results: PolishResultItem[] = [];

    for (const polish of data.polishes) {
      // 验证必需字段
      if (!polish.originalText || !polish.polishedText || !polish.explanation) {
        continue;
      }

      // 验证范围
      if (typeof polish.start !== 'number' || typeof polish.end !== 'number') {
        continue;
      }

      if (polish.start < 0 || polish.end > originalText.length || polish.start >= polish.end) {
        continue;
      }

      // 验证原文本是否匹配
      const actualOriginalText = originalText.substring(polish.start, polish.end);
      if (actualOriginalText.trim() !== polish.originalText.trim()) {
        // 尝试在附近查找匹配的文本
        const foundIndex = originalText.indexOf(polish.originalText, Math.max(0, polish.start - 50));
        if (foundIndex !== -1) {
          polish.start = foundIndex;
          polish.end = foundIndex + polish.originalText.length;
        } else {
          continue; // 跳过无法匹配的项
        }
      }

      results.push({
        id: generateId(),
        type: mapPolishType(polish.type),
        originalText: polish.originalText,
        polishedText: polish.polishedText,
        explanation: polish.explanation,
        confidence: Math.max(0, Math.min(1, polish.confidence || 0.8)),
        range: {
          start: polish.start,
          end: polish.end,
        },
      });
    }

    return results.sort((a, b) => a.range.start - b.range.start);
  } catch (error) {
    console.warn('Failed to parse polish response:', error);
    return [];
  }
}

/**
 * 映射润色类型
 */
function mapPolishType(type: string): PolishResultItem['type'] {
  switch (type?.toLowerCase()) {
    case 'clarity':
      return 'clarity';
    case 'conciseness':
      return 'conciseness';
    case 'tone':
      return 'tone';
    case 'structure':
      return 'structure';
    default:
      return 'clarity';
  }
}

/**
 * 应用润色建议
 */
export function applyPolish(originalText: string, polishItem: PolishResultItem): string {
  const { range, polishedText } = polishItem;
  
  return (
    originalText.substring(0, range.start) +
    polishedText +
    originalText.substring(range.end)
  );
}

/**
 * 批量应用润色建议
 */
export function applyMultiplePolishes(
  originalText: string,
  polishItems: PolishResultItem[]
): string {
  // 按位置倒序排列，从后往前应用，避免位置偏移
  const sortedItems = [...polishItems].sort((a, b) => b.range.start - a.range.start);
  
  let result = originalText;
  
  for (const item of sortedItems) {
    result = applyPolish(result, item);
  }
  
  return result;
}
