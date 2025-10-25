import { ChatOpenAI } from '@langchain/openai';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';
import { LangChainService, StructuredOutputMethod } from '../LangChainService';

/**
 * 文本翻译功能的完整实现
 * 包含Schema定义、Prompt模板和LCEL Chain
 */

// ===== Schema定义 =====

/**
 * 文本翻译功能的Zod Schema
 */
const TranslateSchema = z.object({
  translatedText: z.string().describe('翻译后的文本'),
  sourceLang: z.string().describe('源语言'),
  targetLang: z.string().describe('目标语言'),
  terminology: z.array(z.object({
    original: z.string().describe('原始术语'),
    translated: z.string().describe('翻译后的术语'),
    note: z.string().optional().describe('术语注释')
  })).optional().describe('术语对照表'),
  confidence: z.number().min(0).max(1).optional().describe('翻译质量信心度'),
  alternatives: z.array(z.object({
    text: z.string().describe('替代翻译'),
    reason: z.string().describe('使用此翻译的原因')
  })).optional().describe('替代翻译方案')
});

export type TranslateResult = z.infer<typeof TranslateSchema>;

// ===== 配置常量 =====

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

// ===== Prompt模板 =====

/**
 * 创建文本翻译的ChatPromptTemplate
 */
function createTranslatePromptTemplate(
  targetLanguage: string = 'en',
  sourceLanguage: string = 'auto',
  preserveTerminology: boolean = true
) {
  const sourceLangName = LANGUAGE_NAMES[sourceLanguage as keyof typeof LANGUAGE_NAMES] || sourceLanguage;
  const targetLangName = LANGUAGE_NAMES[targetLanguage as keyof typeof LANGUAGE_NAMES] || targetLanguage;
  const terminologyNote = preserveTerminology ? '保持技术术语不变' : '可以适当本地化专业术语';

  const systemMessage = `你是 openEuler 文档团队的写作与审校助手，遵循 openEuler 的术语与风格规范，保持专业、准确、简洁。
请将以下技术文档从${sourceLangName}翻译为${targetLangName}。

翻译要求：
1. 保持文档的完整结构和格式
2. 确保技术术语的准确性和一致性
3. ${terminologyNote}
4. 保持专业的技术写作风格
5. 确保翻译的连贯性和流畅性
6. 特别注意openEuler相关术语的正确使用

请提供高质量的翻译结果，并记录重要的术语翻译。`;

  return ChatPromptTemplate.fromMessages([
    ['system', systemMessage],
    ['user', '【原文】\n{text}\n\n【上下文】\n{context}']
  ]);
}

// ===== LCEL Chain实现 =====

/**
 * 文本翻译功能的LCEL Chain
 */
export class TranslateChain {
  private chain: any;
  private structuredModel: any;
  private method: StructuredOutputMethod;
  private targetLanguage: string;
  private sourceLanguage: string;
  private preserveTerminology: boolean;
  private initialized: boolean = false;

  constructor(
    private langChainService: LangChainService,
    targetLanguage: string = 'en',
    sourceLanguage: string = 'auto',
    preserveTerminology: boolean = true
  ) {
    this.targetLanguage = targetLanguage;
    this.sourceLanguage = sourceLanguage;
    this.preserveTerminology = preserveTerminology;
  }

  /**
   * 确保链已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initializeChain();
    }
  }

  /**
   * 初始化链
   */
  private async initializeChain(): Promise<void> {
    try {
      const { model, method } = await this.langChainService.createStructuredModel(TranslateSchema);
      this.structuredModel = model;
      this.method = method;

      const prompt = createTranslatePromptTemplate(this.targetLanguage, this.sourceLanguage, this.preserveTerminology);
      this.chain = prompt.pipe(this.structuredModel);
      this.initialized = true;

      console.log(`TranslateChain initialized with method: ${method}`);
    } catch (error) {
      console.error('Failed to initialize TranslateChain:', error);
      throw error;
    }
  }

  /**
   * 执行文本翻译
   */
  async invoke(text: string, context: string = ''): Promise<TranslateResult> {
    try {
      await this.ensureInitialized();
      const result = await this.chain.invoke({
        text,
        context: context || '无特定上下文'
      });
      return result;
    } catch (error) {
      throw new Error(`文本翻译失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 批量翻译文本
   */
  async batch(items: Array<{ text: string; context?: string }>): Promise<TranslateResult[]> {
    try {
      await this.ensureInitialized();
      const results = await Promise.all(
        items.map(item => this.invoke(item.text, item.context))
      );
      return results;
    } catch (error) {
      throw new Error(`批量文本翻译失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 获取当前使用的方法
   */
  getMethod(): StructuredOutputMethod {
    return this.method;
  }

  /**
   * 重新初始化链（用于配置更新后）
   */
  async reinitialize(): Promise<void> {
    this.initialized = false;
    await this.ensureInitialized();
  }
}