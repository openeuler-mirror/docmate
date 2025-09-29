import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { TerminologyService } from '@docmate/utils';
import { createError, ErrorCode, CheckRule } from '@docmate/shared';
import { PolishChain, PolishResult } from './chains/PolishChain';
import { TranslateChain, TranslateResult } from './chains/TranslateChain';
import { RewriteChain, RewriteResult } from './chains/RewriteChain';
import { CheckChain, CheckResult } from './chains/CheckChain';

/**
 * LangChain AI服务配置接口
 */
export interface LangChainAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * LangChain AI服务
 * 使用LangChain框架管理AI交互，移除手写的API调用和响应解析代码
 */
export class LangChainService {
  private chatModel: ChatOpenAI;
  private terminologyService: TerminologyService;
  private customConfig: {
    timeout: number;
    maxRetries: number;
    baseUrl: string;
  };

  constructor(config: LangChainAIConfig) {
    // 初始化ChatOpenAI实例
    this.chatModel = new ChatOpenAI({
      apiKey: config.apiKey,
      model: config.model,
      temperature: 0.1, // 默认温度，可以在具体chain中覆盖
      configuration: {
        baseURL: config.baseUrl,
      },
    });

    // 存储额外配置
    this.customConfig = {
      timeout: config.timeout || 60000,
      maxRetries: config.maxRetries || 3,
      baseUrl: config.baseUrl || ''
    };

    this.terminologyService = new TerminologyService();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LangChainAIConfig>): void {
    // 创建新的ChatOpenAI实例
    this.chatModel = new ChatOpenAI({
      apiKey: config.apiKey || this.chatModel.apiKey,
      model: config.model || this.chatModel.model,
      temperature: 0.1,
      configuration: {
        baseURL: config.baseUrl || this.customConfig.baseUrl || '',
      },
    });

    // 更新自定义配置
    this.customConfig = {
      timeout: config.timeout || this.customConfig.timeout,
      maxRetries: config.maxRetries || this.customConfig.maxRetries,
      baseUrl: config.baseUrl || this.customConfig.baseUrl
    };
  }

  /**
   * 获取基础的ChatOpenAI实例
   */
  getChatModel(): ChatOpenAI {
    return this.chatModel;
  }

  /**
   * 获取术语服务实例
   */
  getTerminologyService(): TerminologyService {
    return this.terminologyService;
  }

  /**
   * 验证配置是否有效
   */
  isConfigValid(): boolean {
    return !!(this.chatModel.apiKey && this.chatModel.model);
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 发送简单的测试消息
      await this.chatModel.invoke([{ role: 'user', content: 'test' }]);
      return true;
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `Connection test failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 创建带结构化输出的模型实例
   */
  createStructuredModel<T extends z.ZodSchema>(schema: T) {
    return this.chatModel.withStructuredOutput(schema);
  }

  /**
   * 获取配置信息
   */
  getConfig(): LangChainAIConfig {
    return {
      apiKey: this.chatModel.apiKey || '',
      baseUrl: this.customConfig.baseUrl,
      model: this.chatModel.model || '',
      timeout: this.customConfig.timeout,
      maxRetries: this.customConfig.maxRetries,
    };
  }

  /**
   * 文本润色
   * @param text 要润色的文本
   * @param focusOn 润色重点
   * @param targetAudience 目标读者
   * @returns 润色结果
   */
  async polish(
    text: string,
    focusOn: 'clarity' | 'conciseness' | 'tone' | 'structure' | 'all' = 'all',
    targetAudience: 'technical' | 'general' | 'beginner' | 'expert' = 'technical'
  ): Promise<PolishResult> {
    const chain = new PolishChain(this.chatModel, focusOn, targetAudience);
    return await chain.invoke(text);
  }

  /**
   * 文本翻译
   * @param text 要翻译的文本
   * @param targetLanguage 目标语言
   * @param sourceLanguage 源语言
   * @param preserveTerminology 是否保持术语
   * @param context 上下文信息
   * @returns 翻译结果
   */
  async translate(
    text: string,
    targetLanguage: string = 'en',
    sourceLanguage: string = 'auto',
    preserveTerminology: boolean = true,
    context: string = ''
  ): Promise<TranslateResult> {
    const chain = new TranslateChain(this.chatModel, targetLanguage, sourceLanguage, preserveTerminology);
    return await chain.invoke(text, context);
  }

  /**
   * 文本重写
   * @param text 要重写的文本
   * @param instruction 重写指令
   * @param preserveTerminology 是否保持术语
   * @returns 重写结果
   */
  async rewrite(
    text: string,
    instruction: string,
    preserveTerminology: boolean = true
  ): Promise<RewriteResult> {
    const chain = new RewriteChain(this.chatModel, preserveTerminology);
    return await chain.invoke(text, instruction);
  }

  /**
   * 文本检查 - Map-Reduce实现
   * @param text 要检查的文本
   * @param customRules 自定义检查规则
   * @returns 检查结果
   */
  async check(
    text: string,
    customRules: CheckRule[] = []
  ): Promise<CheckResult> {
    const chain = new CheckChain(this.chatModel, customRules);
    return await chain.invoke(text);
  }

  /**
   * 更新检查规则
   * @param rules 新的检查规则列表
   */
  updateCheckRules(rules: CheckRule[]): void {
    // 这里可以通过CheckChain的updateCustomRules方法更新
    // 注意：当前的实现每次都会创建新的CheckChain实例
    console.log('Check rules updated:', rules.length);
  }
}