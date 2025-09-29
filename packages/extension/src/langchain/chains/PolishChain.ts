import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

/**
 * 文本润色功能的完整实现
 * 包含Schema定义、Prompt模板和LCEL Chain
 */

// ===== Schema定义 =====

/**
 * 文本润色功能的Zod Schema
 */
const PolishSchema = z.object({
  polishedText: z.string().describe('润色后的文本'),
  changes: z.array(z.object({
    type: z.enum(['wording', 'grammar', 'style', 'clarity', 'flow']).describe('修改类型'),
    original: z.string().describe('原始文本'),
    improved: z.string().describe('改进后的文本'),
    reason: z.string().describe('修改原因')
  })).optional().describe('详细的修改列表'),
  summary: z.string().optional().describe('润色总结'),
  confidence: z.number().min(0).max(1).optional().describe('润色质量信心度')
});

export type PolishResult = z.infer<typeof PolishSchema>;

// ===== 配置常量 =====

/**
 * 润色重点描述映射
 */
const FOCUS_DESCRIPTIONS = {
  clarity: '提高表达的清晰度和准确性',
  conciseness: '使表达更加简洁明了',
  tone: '调整语调和表达方式',
  structure: '优化文档结构和逻辑',
  all: '全面提升文档质量'
} as const;

/**
 * 目标读者描述映射
 */
const AUDIENCE_DESCRIPTIONS = {
  technical: '技术人员',
  general: '一般用户',
  beginner: '初学者',
  expert: '专家用户'
} as const;

// ===== Prompt模板 =====

/**
 * 创建文本润色的ChatPromptTemplate
 */
function createPolishPromptTemplate(
  focusOn: keyof typeof FOCUS_DESCRIPTIONS = 'all',
  targetAudience: keyof typeof AUDIENCE_DESCRIPTIONS = 'technical'
) {
  const focusDescription = FOCUS_DESCRIPTIONS[focusOn] || FOCUS_DESCRIPTIONS.all;
  const audienceDescription = AUDIENCE_DESCRIPTIONS[targetAudience] || AUDIENCE_DESCRIPTIONS.technical;

  const systemMessage = `你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。
请对以下文档进行润色，重点${focusDescription}，目标读者是${audienceDescription}。

请分析文本并提供润色建议，包括：
1. 完整的润色后文本
2. 主要的修改点说明
3. 润色总结

确保保持原文的技术准确性，仅改进表达方式和语言质量。`;

  return ChatPromptTemplate.fromMessages([
    ['system', systemMessage],
    ['user', '【原文】\n{text}']
  ]);
}

// ===== LCEL Chain实现 =====

/**
 * 文本润色功能的LCEL Chain
 */
export class PolishChain {
  private chain: any;

  constructor(
    private model: ChatOpenAI,
    focusOn: keyof typeof FOCUS_DESCRIPTIONS = 'all',
    targetAudience: keyof typeof AUDIENCE_DESCRIPTIONS = 'technical'
  ) {
    // 创建带结构化输出的模型
    const structuredModel = this.model.withStructuredOutput(PolishSchema);

    // 创建提示词模板
    const prompt = createPolishPromptTemplate(focusOn, targetAudience);

    // 构建LCEL链：prompt -> model
    this.chain = prompt.pipe(structuredModel);
  }

  /**
   * 执行文本润色
   */
  async invoke(text: string): Promise<PolishResult> {
    try {
      const result = await this.chain.invoke({ text });
      return result;
    } catch (error) {
      throw new Error(`文本润色失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 批量润色文本
   */
  async batch(texts: string[]): Promise<PolishResult[]> {
    try {
      const results = await Promise.all(
        texts.map(text => this.invoke(text))
      );
      return results;
    } catch (error) {
      throw new Error(`批量文本润色失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}