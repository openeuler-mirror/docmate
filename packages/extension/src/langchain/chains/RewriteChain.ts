import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

/**
 * 文本重写功能的完整实现
 * 包含Schema定义、Prompt模板和LCEL Chain
 */

// ===== Schema定义 =====

/**
 * 文本重写功能的Zod Schema
 */
const RewriteSchema = z.object({
  rewrittenText: z.string().describe('重写后的文本'),
  changes: z.array(z.object({
    type: z.enum(['structure', 'tone', 'style', 'content', 'formatting']).describe('修改类型'),
    original: z.string().describe('原始文本'),
    rewritten: z.string().describe('重写后的文本'),
    reason: z.string().describe('修改原因')
  })).optional().describe('详细的修改列表'),
  summary: z.string().optional().describe('重写总结'),
  tone: z.string().optional().describe('文本语调调整'),
  style: z.string().optional().describe('文本风格调整'),
  confidence: z.number().min(0).max(1).optional().describe('重写质量信心度')
});

export type RewriteResult = z.infer<typeof RewriteSchema>;

// ===== Prompt模板 =====

/**
 * 创建文本重写的ChatPromptTemplate
 */
function createRewritePromptTemplate(
  preserveTerminology: boolean = true
) {
  const terminologyNote = preserveTerminology
    ? '严格保持技术术语的准确性，不要随意更改专业术语。'
    : '可以适当调整专业术语以提升表达效果。';

  const systemMessage = `你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。
请根据用户指令对文本进行改写。

改写要求：
1. 保持原文的核心信息与技术准确性
2. 根据用户的具体指令进行调整，语气统一、行文简洁
3. ${terminologyNote}
4. 保持openEuler文档的专业风格

请按照用户指令进行文本改写，记录主要的修改内容和调整效果。`;

  return ChatPromptTemplate.fromMessages([
    ['system', systemMessage],
    ['user', '【原文】\n{text}\n\n【用户指令】\n{instruction}']
  ]);
}

// ===== LCEL Chain实现 =====

/**
 * 文本重写功能的LCEL Chain
 */
export class RewriteChain {
  private chain: any;

  constructor(
    private model: ChatOpenAI,
    preserveTerminology: boolean = true
  ) {
    // 创建带结构化输出的模型
    const structuredModel = this.model.withStructuredOutput(RewriteSchema);

    // 创建提示词模板
    const prompt = createRewritePromptTemplate(preserveTerminology);

    // 构建LCEL链：prompt -> model
    this.chain = prompt.pipe(structuredModel);
  }

  /**
   * 执行文本重写
   */
  async invoke(text: string, instruction: string): Promise<RewriteResult> {
    try {
      const result = await this.chain.invoke({
        text,
        instruction
      });
      return result;
    } catch (error) {
      throw new Error(`文本重写失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 批量重写文本
   */
  async batch(items: Array<{ text: string; instruction: string }>): Promise<RewriteResult[]> {
    try {
      const results = await Promise.all(
        items.map(item => this.invoke(item.text, item.instruction))
      );
      return results;
    } catch (error) {
      throw new Error(`批量文本重写失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}