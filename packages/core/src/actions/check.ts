import { CheckResultItem, CheckResult, generateId, createError } from '@docmate/shared';
import { AIService } from '../services/AIService';
import { TerminologyService } from '../services/TerminologyService';
import { IAction, ActionExecuteOptions } from './BaseAction';
import { calculateDiff } from '../utils/diff';

export interface CheckOptions {
  enableTerminology?: boolean;
  enableGrammar?: boolean;
  enableStyle?: boolean;
  enableConsistency?: boolean;
  strictMode?: boolean;
}

export class CheckAction implements IAction<CheckResult> {
  private aiService: AIService;
  private terminologyService: TerminologyService;

  constructor(aiService: AIService, terminologyService: TerminologyService) {
    this.aiService = aiService;
    this.terminologyService = terminologyService;
  }

  async execute(options: ActionExecuteOptions & { checkOptions?: CheckOptions }): Promise<CheckResult> {
    const { text, checkOptions = {} } = options;

    if (!text.trim()) {
      return { diffs: [], issues: [] };
    }

    const issues: CheckResultItem[] = [];

    try {
      // 1. 术语检查
      if (checkOptions.enableTerminology !== false) {
        const terminologyResults = checkTerminology(text, this.terminologyService);
        issues.push(...terminologyResults);
      }

      // 2. AI检查（语法、风格、一致性）
      if (this.aiService.validateConfig()) {
        const aiResults = await performAICheck(text, this.aiService, checkOptions);
        issues.push(...aiResults);
      }

      // 3. 生成修正后的文本和diff
      const correctedText = this.applyCorrections(text, issues);
      const diffs = calculateDiff(text, correctedText);

      // 4. 转换issues格式
      const formattedIssues = issues.map(issue => ({
        message: issue.message,
        suggestion: issue.suggestedText || issue.suggestion || '',
        range: [issue.range.start, issue.range.end] as [number, number],
      }));

      return {
        diffs,
        issues: formattedIssues,
      };
    } catch (error) {
      throw createError(
        'CHECK_FAILED',
        'Failed to perform document check',
        { originalError: error }
      );
    }
  }

  /**
   * 应用修正建议生成修正后的文本
   */
  private applyCorrections(text: string, issues: CheckResultItem[]): string {
    if (issues.length === 0) {
      return text;
    }

    let result = text;

    // 按位置倒序排列，从后往前应用，避免位置偏移
    const sortedIssues = issues
      .filter(issue => issue.suggestedText && issue.range.start >= 0 && issue.range.end <= text.length)
      .sort((a, b) => b.range.start - a.range.start);

    for (const issue of sortedIssues) {
      if (issue.suggestedText) {
        result = result.substring(0, issue.range.start) +
                 issue.suggestedText +
                 result.substring(issue.range.end);
      }
    }

    return result;
  }
}

// 保持向后兼容的函数
export async function execute(
  text: string,
  aiService: AIService,
  terminologyService: TerminologyService,
  options: CheckOptions = {}
): Promise<CheckResultItem[]> {
  const action = new CheckAction(aiService, terminologyService);
  const result = await action.execute({ text, checkOptions: options });

  // 从新格式转换为旧格式以保持兼容性
  return result.issues.map((issue) => ({
    id: generateId(),
    type: 'grammar' as const,
    severity: 'warning' as const,
    message: issue.message,
    suggestion: issue.suggestion,
    range: {
      start: issue.range[0],
      end: issue.range[1],
    },
    originalText: text.substring(issue.range[0], issue.range[1]),
    suggestedText: issue.suggestion,
    confidence: 0.8,
  }));
}

/**
 * 术语检查
 */
function checkTerminology(
  text: string,
  terminologyService: TerminologyService
): CheckResultItem[] {
  const results: CheckResultItem[] = [];
  const terminologyUsage = terminologyService.checkTerminologyUsage(text);

  for (const usage of terminologyUsage) {
    if (!usage.isCorrect && usage.suggestion) {
      results.push({
        id: generateId(),
        type: 'terminology',
        severity: 'warning',
        message: `术语使用不规范：建议使用 "${usage.suggestion}" 而不是 "${usage.term}"`,
        suggestion: usage.suggestion,
        range: {
          start: usage.position,
          end: usage.position + usage.length,
        },
        originalText: usage.term,
        suggestedText: usage.suggestion,
        confidence: 0.9,
        source: 'openEuler术语',
      });
    }
  }

  return results;
}

/**
 * AI检查
 */
async function performAICheck(
  text: string,
  aiService: AIService,
  options: CheckOptions
): Promise<CheckResultItem[]> {
  const checkTypes: string[] = [];
  
  if (options.enableGrammar !== false) {
    checkTypes.push('语法错误');
  }
  
  if (options.enableStyle !== false) {
    checkTypes.push('写作风格');
  }
  
  if (options.enableConsistency !== false) {
    checkTypes.push('内容一致性');
  }

  if (checkTypes.length === 0) {
    return [];
  }

  const prompt = createCheckPrompt(text, checkTypes, options.strictMode);
  
  try {
    const response = await aiService.generate(prompt);
    return parseAICheckResponse(response.content, text);
  } catch (error) {
    console.warn('AI check failed:', error);
    return [];
  }
}

/**
 * 创建检查提示词
 */
function createCheckPrompt(text: string, checkTypes: string[], strictMode = false): string {
  const strictnessLevel = strictMode ? '严格' : '标准';
  
  return `请对以下技术文档进行${strictnessLevel}级别的检查，重点关注：${checkTypes.join('、')}。

文档内容：
"""
${text}
"""

请以JSON格式返回检查结果，格式如下：
{
  "issues": [
    {
      "type": "grammar|style|consistency",
      "severity": "error|warning|info",
      "message": "问题描述",
      "suggestion": "修改建议",
      "start": 起始位置,
      "end": 结束位置,
      "originalText": "原文本",
      "suggestedText": "建议文本",
      "confidence": 0.0-1.0
    }
  ]
}

注意：
1. 只返回JSON格式，不要包含其他文字
2. 位置索引从0开始
3. 置信度范围0.0-1.0
4. 针对技术文档的特点进行检查
5. 重点关注openEuler相关术语的正确使用`;
}

/**
 * 解析AI检查响应
 */
function parseAICheckResponse(response: string, originalText: string): CheckResultItem[] {
  try {
    // 提取JSON部分
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('No JSON found in AI response');
      return [];
    }

    const data = JSON.parse(jsonMatch[0]);
    
    if (!data.issues || !Array.isArray(data.issues)) {
      console.warn('Invalid AI response format');
      return [];
    }

    const results: CheckResultItem[] = [];

    for (const issue of data.issues) {
      // 验证必需字段
      if (!issue.type || !issue.message || typeof issue.start !== 'number' || typeof issue.end !== 'number') {
        continue;
      }

      // 验证范围
      if (issue.start < 0 || issue.end > originalText.length || issue.start >= issue.end) {
        continue;
      }

      results.push({
        id: generateId(),
        type: mapAITypeToCheckType(issue.type),
        severity: issue.severity || 'info',
        message: issue.message,
        suggestion: issue.suggestion,
        range: {
          start: issue.start,
          end: issue.end,
        },
        originalText: issue.originalText || originalText.substring(issue.start, issue.end),
        suggestedText: issue.suggestedText,
        confidence: Math.max(0, Math.min(1, issue.confidence || 0.7)),
        source: 'AI检查',
      });
    }

    return results;
  } catch (error) {
    console.warn('Failed to parse AI check response:', error);
    return [];
  }
}

/**
 * 映射AI类型到检查类型
 */
function mapAITypeToCheckType(aiType: string): CheckResultItem['type'] {
  switch (aiType.toLowerCase()) {
    case 'grammar':
      return 'grammar';
    case 'style':
      return 'style';
    case 'consistency':
      return 'consistency';
    default:
      return 'grammar';
  }
}
