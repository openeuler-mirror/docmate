import { PolishResultItem, generateId, createError } from '@docmate/shared';
import { AIService } from '../services/AIService';

export interface PolishOptions {
  focusOn?: 'clarity' | 'conciseness' | 'tone' | 'structure' | 'all';
  targetAudience?: 'technical' | 'general' | 'beginner' | 'expert';
  preserveTerminology?: boolean;
  maxLength?: number;
}

export async function execute(
  text: string,
  aiService: AIService,
  options: PolishOptions = {}
): Promise<PolishResultItem[]> {
  if (!text.trim()) {
    return [];
  }

  if (!aiService.validateConfig()) {
    throw createError(
      'AI_CONFIG_INVALID',
      'AI service configuration is invalid'
    );
  }

  try {
    const prompt = createPolishPrompt(text, options);
    const response = await aiService.generate(prompt);
    return parsePolishResponse(response.content, text);
  } catch (error) {
    throw createError(
      'POLISH_FAILED',
      'Failed to polish text',
      { originalError: error }
    );
  }
}

/**
 * 创建润色提示词
 */
function createPolishPrompt(text: string, options: PolishOptions): string {
  const focusArea = options.focusOn || 'all';
  const audience = options.targetAudience || 'technical';
  const preserveTerms = options.preserveTerminology !== false;

  let focusDescription = '';
  switch (focusArea) {
    case 'clarity':
      focusDescription = '提高表达的清晰度和准确性';
      break;
    case 'conciseness':
      focusDescription = '使表达更加简洁明了';
      break;
    case 'tone':
      focusDescription = '调整语调和表达方式';
      break;
    case 'structure':
      focusDescription = '优化文档结构和逻辑';
      break;
    default:
      focusDescription = '全面提升文档质量';
  }

  let audienceDescription = '';
  switch (audience) {
    case 'technical':
      audienceDescription = '技术人员';
      break;
    case 'general':
      audienceDescription = '一般用户';
      break;
    case 'beginner':
      audienceDescription = '初学者';
      break;
    case 'expert':
      audienceDescription = '专家用户';
      break;
  }

  return `请对以下技术文档进行润色，重点${focusDescription}，目标读者是${audienceDescription}。

${preserveTerms ? '注意：请保持openEuler相关技术术语的准确性，不要随意更改专业术语。' : ''}

原文：
"""
${text}
"""

请以JSON格式返回润色结果，格式如下：
{
  "polishes": [
    {
      "type": "clarity|conciseness|tone|structure",
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "原文本",
      "polishedText": "润色后文本",
      "explanation": "修改说明",
      "confidence": 0.0-1.0
    }
  ]
}

要求：
1. 只返回JSON格式，不要包含其他文字
2. 位置索引从0开始
3. 置信度范围0.0-1.0
4. 保持技术文档的专业性
5. 确保润色后的内容准确无误
6. 每个修改都要有清晰的说明`;
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
