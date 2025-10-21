import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';
import { TerminologyService } from '@docmate/utils';
import { createError, ErrorCode, CheckRule } from '@docmate/shared';
import { PolishChain, PolishResult } from './chains/PolishChain';
import { TranslateChain, TranslateResult } from './chains/TranslateChain';
import { RewriteChain, RewriteResult } from './chains/RewriteChain';
import { CheckChain, CheckResult } from './chains/CheckChain';

/**
 * 结构化输出方法类型
 */
export type StructuredOutputMethod = 'json_mode' | 'function_calling' | 'text_fallback';

/**
 * 模型能力检测结果
 */
interface ModelCapabilityResult {
  supportsJsonMode: boolean;
  supportsFunctionCalling: boolean;
  supportsTextFallback: boolean;
  recommendedMethod: StructuredOutputMethod;
  testResults: {
    jsonMode?: { success: boolean; error?: string };
    functionCalling?: { success: boolean; error?: string };
    textFallback?: { success: boolean; error?: string };
  };
}

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
  private modelCapability: ModelCapabilityResult | null = null;

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

    // 重置模型能力缓存
    this.resetModelCapabilityCache();
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
   * 检测模型的结构化输出能力
   * 通过实际测试来确定最佳方法
   */
  async detectModelCapabilities(): Promise<ModelCapabilityResult> {
    if (this.modelCapability) {
      return this.modelCapability;
    }

    const testSchema = z.object({
      message: z.string().describe('测试消息'),
      success: z.boolean().describe('是否成功')
    });

    const results: ModelCapabilityResult['testResults'] = {};
    let supportsJsonMode = false;
    let supportsFunctionCalling = false;
    let supportsTextFallback = false;

    // 1. 测试JSON Mode
    try {
      const jsonModel = this.chatModel.withStructuredOutput(testSchema, { method: 'json_mode' });
      await jsonModel.invoke([
        { role: 'system', content: '请返回一个简单的JSON对象，包含message和success字段。' },
        { role: 'user', content: '测试JSON模式支持' }
      ]);
      supportsJsonMode = true;
      results.jsonMode = { success: true };
    } catch (error) {
      results.jsonMode = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    // 2. 测试Function Calling
    try {
      // 对于某些模型（如DeepSeek），需要特殊配置
      let functionModel = this.chatModel;
      const modelName = this.chatModel.model || '';

      if (modelName.toLowerCase().includes('deepseek')) {
        // 创建特殊配置的模型实例
        functionModel = new ChatOpenAI({
          apiKey: this.chatModel.apiKey,
          model: modelName,
          temperature: 0.1,
          configuration: {
            baseURL: this.customConfig.baseUrl,
          },
          // 添加DeepSeek特殊配置
          ...(this.customConfig.baseUrl.includes('siliconflow') && {
            modelKwargs: {
              enable_thinking: false
            }
          })
        });
      }

      const callingModel = functionModel.withStructuredOutput(testSchema, { method: 'function_calling' });
      await callingModel.invoke([
        { role: 'system', content: '请使用函数调用返回一个简单的对象，包含message和success字段。' },
        { role: 'user', content: '测试函数调用支持' }
      ]);
      supportsFunctionCalling = true;
      results.functionCalling = { success: true };
    } catch (error) {
      results.functionCalling = { success: false, error: error instanceof Error ? error.message : String(error) };
    }

    // 3. 测试文本回退（总是支持的）
    supportsTextFallback = true;
    results.textFallback = { success: true };

    // 确定推荐方法
    let recommendedMethod: StructuredOutputMethod;
    if (supportsJsonMode) {
      recommendedMethod = 'json_mode';
    } else if (supportsFunctionCalling) {
      recommendedMethod = 'function_calling';
    } else {
      recommendedMethod = 'text_fallback';
    }

    this.modelCapability = {
      supportsJsonMode,
      supportsFunctionCalling,
      supportsTextFallback,
      recommendedMethod,
      testResults: results
    };

    return this.modelCapability;
  }

  /**
   * 获取推荐的结构化输出方法
   */
  async getRecommendedMethod(): Promise<StructuredOutputMethod> {
    const capability = await this.detectModelCapabilities();
    return capability.recommendedMethod;
  }

  /**
   * 检查特定方法是否支持
   */
  async isMethodSupported(method: StructuredOutputMethod): Promise<boolean> {
    const capability = await this.detectModelCapabilities();
    switch (method) {
      case 'json_mode':
        return capability.supportsJsonMode;
      case 'function_calling':
        return capability.supportsFunctionCalling;
      case 'text_fallback':
        return capability.supportsTextFallback;
      default:
        return false;
    }
  }

  /**
   * 创建带结构化输出的模型实例
   * 自动检测并使用最佳方法
   */
  async createStructuredModel<T extends z.ZodSchema>(
    schema: T,
    preferredMethod?: StructuredOutputMethod
  ): Promise<{
    model: any;
    method: StructuredOutputMethod;
    capability: ModelCapabilityResult;
  }> {
    const capability = await this.detectModelCapabilities();

    // 确定使用的方法
    let method: StructuredOutputMethod;
    if (preferredMethod && await this.isMethodSupported(preferredMethod)) {
      method = preferredMethod;
    } else {
      method = capability.recommendedMethod;
    }

    // 根据方法创建模型
    let model: any;
    const modelName = this.chatModel.model || '';

    switch (method) {
      case 'json_mode':
        model = this.chatModel.withStructuredOutput(schema, { method: 'json_mode' });
        break;

      case 'function_calling':
        // 对于需要特殊配置的模型
        if (modelName.toLowerCase().includes('deepseek') &&
            this.customConfig.baseUrl.includes('siliconflow')) {
          model = new ChatOpenAI({
            apiKey: this.chatModel.apiKey,
            model: modelName,
            temperature: 0.1,
            configuration: {
              baseURL: this.customConfig.baseUrl,
            },
            modelKwargs: {
              enable_thinking: false
            }
          }).withStructuredOutput(schema, { method: 'function_calling' });
        } else {
          model = this.chatModel.withStructuredOutput(schema, { method: 'function_calling' });
        }
        break;

      case 'text_fallback':
        model = this.createTextFallbackModel(schema);
        break;

      default:
        throw new Error(`不支持的结构化输出方法: ${method}`);
    }

    return { model, method, capability };
  }

  /**
   * 创建文本回退模型
   * 当模型不支持结构化输出时使用文本解析
   */
  private createTextFallbackModel<T extends z.ZodSchema>(schema: T) {
    return {
      invoke: async (messages: any[]) => {
        const lastMessage = messages[messages.length - 1];
        const prompt = `${lastMessage.content}

请按照以下JSON格式返回结果：
\`\`\`json
${JSON.stringify(zodSchemaToJsonExample(schema), null, 2)}
\`\`\`

请确保返回有效的JSON格式。`;

        try {
          const response = await this.chatModel.invoke([
            ...messages.slice(0, -1),
            { role: 'user', content: prompt }
          ]);

          // 尝试从响应中提取JSON
          const content = response.content as string;
          const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) ||
                          content.match(/\{[\s\S]*\}/);

          if (jsonMatch) {
            const jsonData = JSON.parse(jsonMatch[1] || jsonMatch[0]);
            return schema.parse(jsonData);
          }

          throw new Error('无法从响应中提取有效的JSON');
        } catch (error) {
          throw new Error(`文本回退解析失败: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    };
  }

  /**
   * 重置模型能力缓存（用于配置更新后）
   */
  resetModelCapabilityCache(): void {
    this.modelCapability = null;
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
    const chain = new PolishChain(this, focusOn, targetAudience);
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
    const chain = new TranslateChain(this, targetLanguage, sourceLanguage, preserveTerminology);
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
    const chain = new RewriteChain(this, preserveTerminology);
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
    const chain = new CheckChain(this, customRules);
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

/**
 * 将Zod Schema转换为JSON示例
 */
function zodSchemaToJsonExample(schema: z.ZodSchema): any {
  const schemaDef = (schema as any)._def;

  if (schemaDef.typeName === 'ZodObject') {
    const result: any = {};
    const shape = schemaDef.shape();

    for (const [key, value] of Object.entries(shape)) {
      result[key] = getZodTypeExample(value as z.ZodType);
    }

    return result;
  }

  return {};
}

/**
 * 获取Zod类型的示例值
 */
function getZodTypeExample(zodType: z.ZodType): any {
  const typeDef = (zodType as any)._def;

  switch (typeDef.typeName) {
    case 'ZodString':
      return typeDef.description ? `示例${typeDef.description}` : '示例文本';
    case 'ZodNumber':
      return 0;
    case 'ZodBoolean':
      return true;
    case 'ZodArray':
      return [getZodTypeExample(typeDef.type)];
    case 'ZodOptional':
      return getZodTypeExample(typeDef.innerType);
    case 'ZodEnum':
      return typeDef.values[0];
    case 'ZodObject':
      const result: any = {};
      const shape = typeDef.shape();
      for (const [key, value] of Object.entries(shape)) {
        result[key] = getZodTypeExample(value as z.ZodType);
      }
      return result;
    default:
      return null;
  }
}