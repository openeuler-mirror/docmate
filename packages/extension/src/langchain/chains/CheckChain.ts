import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { RunnableLambda } from '@langchain/core/runnables';
import { z } from 'zod';
import * as vscode from 'vscode';
import { TextChunk, Issue, CheckRule, Suggestion, CheckResultPayload } from '@docmate/shared';
import { ChunkerService } from '../../services/ChunkerService';

/**
 * 文本检查功能的完整实现
 * 包含Schema定义、Prompt模板和简化的Map-Reduce LCEL Chain
 */

// ===== Schema定义 =====

/**
 * 单个chunk检查结果
 */
const ChunkCheckResultSchema = z.object({
  chunkId: z.string().describe('分块ID'),
  issues: z.array(z.object({
    chunk_id: z.string().describe('被检查的文本块的唯一标识符'),
    type: z.enum(['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'CONSISTENCY', 'HYPERLINK_ERROR', 'TERMINOLOGY']).describe('问题类型'),
    description: z.string().describe('对问题的简短描述'),
    original_text: z.string().describe('核心文本中的错误部分'),
    suggested_text: z.string().describe('修改后的正确文本'),
    severity: z.enum(['error', 'warning', 'info']).describe('严重程度')
  })).describe('发现的问题列表'),
  summary: z.string().describe('检查总结'),
  confidence: z.number().min(0).max(1).describe('检查信心度')
});

export type ChunkCheckResult = z.infer<typeof ChunkCheckResultSchema>;

/**
 * 最终检查结果
 */
const CheckResultSchema = z.object({
  originalText: z.string().describe('原始文本'),
  issues: z.array(z.object({
    message: z.string().describe('问题消息'),
    suggestion: z.string().optional().describe('建议修改'),
    range: z.tuple([z.number(), z.number()]).describe('位置范围 [start, end]'),
    severity: z.enum(['error', 'warning', 'info']).describe('严重程度'),
    type: z.enum(['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'CONSISTENCY', 'HYPERLINK_ERROR', 'TERMINOLOGY']).describe('问题类型'),
    original_text: z.string().optional().describe('原始错误文本'),
    suggested_text: z.string().optional().describe('建议修改文本'),
    preciseRange: z.object({
      start: z.object({ line: z.number(), character: z.number() }),
      end: z.object({ line: z.number(), character: z.number() })
    }).optional().describe('精确的字符位置范围')
  })).describe('所有问题'),
  totalChunks: z.number().describe('检查的分块数量'),
  totalIssues: z.number().describe('发现问题总数'),
  summary: z.string().describe('检查总结'),
  processingTime: z.number().describe('处理时间（毫秒）')
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

// ===== 默认检查规则 =====

const DEFAULT_CHECK_RULES: CheckRule[] = [
  {
    id: 'TYPO-001',
    name: '中文错别字检查',
    type: 'TYPO',
    description: '找出并修正中文错别字，包括同音字、形近字错误',
    content: '找出并修正中文错别字，包括同音字（如"部署"错为"布署"）、形近字（如"阈值"错为"阀值"），识别多余或缺失的文字。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'PUNCTUATION-001',
    name: '标点符号规范',
    type: 'PUNCTUATION',
    description: '检查标点符号使用规范，确保中英文标点正确使用',
    content: '纯英文内容中不应出现中文标点符号。顿号"、"仅用于句子内部的并列词语之间。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'SPACING-001',
    name: '空格规范',
    type: 'SPACING',
    description: '检查中英文夹杂时的空格使用规范',
    content: '中英文夹杂时必须有且仅有一个半角空格。英文标点符号后应有半角空格，前面不能有空格。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'FORMATTING-001',
    name: '格式规范',
    type: 'FORMATTING',
    description: '检查代码格式、文件名等格式要求',
    content: '行内代码、命令行和文件名需要用反引号 (`) 包裹，只有确认要包裹的再添加，不用特别严格，且```代码块内的命令不用管。代码块注释符号必须正确。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'STYLE-001',
    name: '风格一致性',
    type: 'STYLE',
    description: '检查文档风格的一致性，包括标点、格式等',
    content: '同级别内容的结尾标点应保持一致。描述功能键或UI元素的格式应在全文中保持一致。行间距应保持一致。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'HYPERLINK_ERROR-001',
    name: '超链接检查',
    type: 'HYPERLINK_ERROR',
    description: '检查超链接格式和描述的正确性',
    content: '外部手册链接应包含书名号《》，web链接则不需要。超链接文字描述应与实际内容相符。',
    enabled: true,
    isDefault: true
  },
  {
    id: 'TERMINOLOGY-001',
    name: '术语规范',
    type: 'TERMINOLOGY',
    description: '检查术语使用的正确性和一致性',
    content: '仅检查明显的术语大小写错误（如 "OpenEuler" 或 "openeuler" 应为 "openEuler"）。如果术语已经是正确格式，不要创建不必要的suggestion。确保术语在文档中的使用一致性。',
    enabled: true,
    isDefault: true
  }
];

// ===== Prompt模板 =====

/**
 * 创建分块检查的提示词模板
 */
function createChunkCheckPromptTemplate(chunk: TextChunk, checkRules: CheckRule[] = []): string {
  // 如果没有提供规则，使用默认规则
  const rules = checkRules.length > 0 ? checkRules : DEFAULT_CHECK_RULES;

  // 只使用启用的规则
  const enabledRules = rules.filter(rule => rule.enabled);

  // 动态构建检查规则部分
  const rulesSection = enabledRules.map((rule, index) => {
    const cleanContent = rule.content
      .replace(/<|>/g, '')
      .replace(/\\n/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();

    return `**${index + 1}. ${rule.name} (${rule.type})**\n${cleanContent}`;
  }).join('\n\n');

  return `你是openEuler文档审校专家。请检查核心文本中的问题，必须使用 return_chunk_check_result 函数返回结果。

**重要要求**:
- 只检查"核心文本"，上下文仅作参考
- 每个问题必须提供精确的 original_text 和 suggested_text
- 仅标记实际存在的问题，不要产生"幻觉"
- 必须通过调用 return_chunk_check_result 函数返回结果，不要直接输出JSON

**检查规则 (必须严格遵守)**:

${rulesSection}

**函数调用说明**:
你必须调用 return_chunk_check_result 函数，参数如下：
- chunk_id: 必须精确设置为 "${chunk.id}"
- suggestions: 问题建议数组，每个建议包含：
  - chunk_id: 必须设置为 "${chunk.id}"（与父级相同）
  - type: 问题类型（${enabledRules.map(r => r.type).join('/')}）
  - description: 简短问题标题
  - original_text: 核心文本中的错误部分
  - suggested_text: 修改后的正确文本
  - severity: 严重程度（error/warning/info）

**文档内容**:
以下部分会提供核心文本和上下文，只需要检查核心文本，上下文仅供参考！
**核心文本**:
---
${chunk.core_text}
---
${chunk.context_before ? `**上文**:
---
${chunk.context_before}
---` : ''}
${chunk.context_after ? `**下文**:
---
${chunk.context_after}
---` : ''}
`;
}

// ===== 简化的CheckChain实现 =====

/**
 * 文本检查功能的简化LCEL Chain
 * 降低了复杂度，优化了Map-Reduce流程
 */
export class CheckChain {
  private chain: any;
  private customRules: CheckRule[] = [];
  private structuredModel: any;

  constructor(
    private model: ChatOpenAI,
    private checkRules: CheckRule[] = []
  ) {
    this.customRules = checkRules;
    this.structuredModel = this.createStructuredModel();
    this.chain = this.createSimplifiedChain();
  }

  /**
   * 创建结构化模型实例
   */
  private createStructuredModel() {
    return this.model.withStructuredOutput(
      z.object({
        chunk_id: z.string().describe('被检查的文本块的唯一标识符'),
        suggestions: z.array(z.object({
          chunk_id: z.string().describe('被检查的文本块的唯一标识符'),
          type: z.enum(['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'HYPERLINK_ERROR', 'TERMINOLOGY']).describe('问题类型'),
          description: z.string().describe('对问题的简短描述'),
          original_text: z.string().describe('核心文本中的错误部分'),
          suggested_text: z.string().describe('修改后的正确文本'),
          severity: z.enum(['error', 'warning', 'info']).describe('严重程度')
        })).describe('问题建议数组'),
        summary: z.string().optional().describe('检查总结'),
        confidence: z.number().min(0).max(1).optional().describe('检查信心度')
      }).describe('返回文本块检查的结构化结果'),
      {
        name: 'return_chunk_check_result'
      }
    );
  }

  /**
   * 创建简化的Map-Reduce链
   */
  private createSimplifiedChain() {
    // 1. 文本分块
    const chunker = new RunnableLambda({
      func: this.chunkText.bind(this)
    });

    // 2. 并行处理chunks
    const processor = new RunnableLambda({
      func: async (chunks: TextChunk[]) => {
        const results = await Promise.all(
          chunks.map(async (chunk) => {
            const prompt = createChunkCheckPromptTemplate(chunk, this.customRules);
            const result = await this.structuredModel.invoke([
              { role: 'user', content: prompt }
            ], { temperature: 0.1 });

            return {
              chunkId: result.chunk_id,
              issues: result.suggestions || [],
              summary: result.summary || '',
              confidence: result.confidence || 0.9,
              chunk
            };
          })
        );
        return results;
      }
    });

    // 3. 结果合并
    const combiner = new RunnableLambda({
      func: this.combineResults.bind(this)
    });

    return chunker.pipe(processor).pipe(combiner);
  }

  /**
   * 文本分块处理
   */
  private async chunkText(input: { text: string; selectionRange?: vscode.Range }): Promise<TextChunk[]> {
    try {
      const { text, selectionRange } = input;

      if (!text || text.trim().length === 0) {
        return [];
      }

      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw new Error('No active editor found');
      }

      const currentSelection = editor.selection;
      const defaultRange = new vscode.Range(
        new vscode.Position(0, 0),
        new vscode.Position(editor.document.lineCount, 0)
      );

      const finalRange = selectionRange || currentSelection.isEmpty ? defaultRange : currentSelection;

      return ChunkerService.chunkText(text, finalRange, 1);
    } catch (error) {
      console.error('Error in text chunking:', error);
      throw new Error(`文本分块失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 合并检查结果
   */
  private async combineResults(chunkResults: Array<ChunkCheckResult & { chunk: TextChunk }>): Promise<CheckResult> {
    const startTime = Date.now();

    try {
      const allSuggestions: Suggestion[] = [];
      const chunks: TextChunk[] = [];

      for (const result of chunkResults) {
        const { chunk, issues, chunkId } = result;
        chunks.push(chunk);

        for (const issue of issues) {
          const final_chunk_id = issue.chunk_id || chunk.id;

          // 过滤无意义的修改
          if (issue.original_text.trim() === issue.suggested_text.trim()) {
            continue;
          }

          allSuggestions.push({
            chunk_id: final_chunk_id,
            type: issue.type,
            description: issue.description,
            original_text: issue.original_text,
            suggested_text: issue.suggested_text,
            severity: issue.severity
          });
        }
      }

      // 使用ValidationService进行验证
      const { ValidationService } = await import('../../services/ValidationService');
      const checkResultPayload: CheckResultPayload = {
        suggestions: allSuggestions
      };

      const diagnostics = ValidationService.validateAndMap(chunks, checkResultPayload);

      // 转换为issues格式
      const issues: CheckResult['issues'] = diagnostics.map(diagnostic => ({
        message: diagnostic.message,
        suggestion: diagnostic.suggested_text,
        range: [diagnostic.range.start.line, diagnostic.range.end.line],
        severity: diagnostic.severity,
        type: diagnostic.suggestion_type as 'TYPO' | 'PUNCTUATION' | 'SPACING' | 'FORMATTING' | 'STYLE' | 'CONSISTENCY' | 'HYPERLINK_ERROR' | 'TERMINOLOGY',
        original_text: diagnostic.original_text,
        suggested_text: diagnostic.suggested_text,
        preciseRange: {
          start: { line: diagnostic.range.start.line, character: diagnostic.range.start.character },
          end: { line: diagnostic.range.end.line, character: diagnostic.range.end.character }
        }
      }));

      const summary = `检查完成：共检查 ${chunkResults.length} 个文本块，发现 ${issues.length} 个问题。`;

      return {
        originalText: chunkResults.length > 0 ? chunkResults[0].chunk.core_text : '',
        issues,
        totalChunks: chunkResults.length,
        totalIssues: issues.length,
        summary,
        processingTime: Date.now() - startTime
      };
    } catch (error) {
      console.error('Error in result combination:', error);
      throw new Error(`结果合并失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 执行文本检查
   */
  async invoke(text: string, selectionRange?: vscode.Range): Promise<CheckResult> {
    try {
      const result = await this.chain.invoke({ text, selectionRange });
      return result;
    } catch (error) {
      throw new Error(`文本检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 更新自定义检查规则
   */
  updateCustomRules(rules: CheckRule[]): void {
    this.customRules = rules;
    this.structuredModel = this.createStructuredModel();
    this.chain = this.createSimplifiedChain();
  }
}