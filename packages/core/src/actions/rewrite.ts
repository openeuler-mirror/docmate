import { RewriteResult, ChatMessage, generateId, createError } from '@docmate/shared';
import { IExtendedAction, ExtendedActionExecuteOptions, BaseActionResult } from './BaseAction';
import { AIService } from '../services/AIService';
import { calculateDiff } from '../utils/diff';
import { PromptBuilder } from '../prompts';

export interface RewriteOptions {
  instruction?: string;
  preserveFormat?: boolean;
  targetStyle?: 'formal' | 'casual' | 'technical' | 'creative';
  maxLength?: number;
  minLength?: number;
}

export interface RewriteActionOptions extends ExtendedActionExecuteOptions {
  conversationHistory: ChatMessage[];
  instruction?: string;
  originalText?: string; // 需要改写的原始文本
}

export class RewriteAction implements IExtendedAction<RewriteResult> {
  private aiService: AIService;

  constructor(aiService: AIService) {
    this.aiService = aiService;
  }

  async execute(options: RewriteActionOptions): Promise<RewriteResult> {
    if (!options.text.trim()) {
      throw createError(
        'REWRITE_EMPTY_TEXT',
        'Text to rewrite cannot be empty'
      );
    }

    if (!this.aiService.validateConfig()) {
      throw createError(
        'AI_CONFIG_INVALID',
        'AI service configuration is invalid'
      );
    }

    try {
      console.log('RewriteAction: Starting rewrite with options:', options);

      const conversationId = this.generateConversationId();

      // 构建改写提示
      const prompt = this.createRewritePrompt(options);

      console.log('RewriteAction: Calling AI service with prompt:', prompt);

      // 调用AI服务
      const response = await this.aiService.generate(prompt);

      console.log('RewriteAction: AI service response:', response);

      if (!response.success) {
        console.error('RewriteAction: AI service failed:', response.error);
        throw createError(
          'REWRITE_AI_FAILED',
          response.error?.message || 'AI service failed to generate rewrite'
        );
      }

      // 确定原始文本（用于计算diff）
      const originalText = this.determineOriginalText(options);

      console.log('RewriteAction: Original text:', originalText);
      console.log('RewriteAction: Generated text:', response.content);

      // 计算差异
      const diffs = calculateDiff(originalText, response.content);

      console.log('RewriteAction: Calculated diffs:', diffs);

      return {
        diffs,
        conversationId,
      };
    } catch (error) {
      console.error('RewriteAction: Error occurred:', error);
      throw createError(
        'REWRITE_FAILED',
        'Failed to rewrite text',
        { originalError: error }
      );
    }
  }

  /**
   * 生成对话ID
   */
  private generateConversationId(): string {
    return `rewrite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 创建改写提示
   */
  private createRewritePrompt(options: RewriteActionOptions): string {
    const originalText = options.originalText || '';
    const userInstruction = options.text;

    return PromptBuilder.buildRewritePrompt(originalText, userInstruction, {
      preserveTerminology: options.preserveTerminology
    });
  }

  /**
   * 准备对话历史
   */
  private prepareConversationHistory(
    options: RewriteActionOptions, 
    systemPrompt: string
  ): ChatMessage[] {
    const history: ChatMessage[] = [];

    // 添加系统提示
    history.push({
      role: 'system',
      content: systemPrompt,
      timestamp: new Date().toISOString(),
    });

    // 如果有原始文本，先添加原始文本
    if (options.originalText) {
      history.push({
        role: 'user',
        content: `请改写以下文本：\n\n${options.originalText}`,
        timestamp: new Date().toISOString(),
      });
    }

    // 添加现有的对话历史（排除系统消息）
    if (options.conversationHistory) {
      const userHistory = options.conversationHistory.filter(msg => msg.role !== 'system');
      history.push(...userHistory);
    }

    return history;
  }

  /**
   * 确定用于diff计算的原始文本
   */
  private determineOriginalText(options: RewriteActionOptions): string {
    // 如果明确指定了原始文本，使用它
    if (options.originalText) {
      return options.originalText;
    }

    // 否则，从对话历史中查找最后一次助手的回复作为原始文本
    if (options.conversationHistory && options.conversationHistory.length > 0) {
      const lastAssistantMessage = options.conversationHistory
        .slice()
        .reverse()
        .find(msg => msg.role === 'assistant');
      
      if (lastAssistantMessage) {
        return lastAssistantMessage.content;
      }

      // 如果没有助手回复，查找第一条用户消息中的文本
      const firstUserMessage = options.conversationHistory.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        // 尝试提取"请改写以下文本："后面的内容
        const match = firstUserMessage.content.match(/请改写以下文本：\s*\n\n(.+)/s);
        if (match) {
          return match[1];
        }
        return firstUserMessage.content;
      }
    }

    // 最后的备选方案：使用当前的指令文本
    return options.text;
  }

  /**
   * 验证改写选项
   */
  private validateOptions(options: RewriteActionOptions): void {
    if (!options.text || typeof options.text !== 'string') {
      throw createError('INVALID_INPUT', 'Text is required and must be a string');
    }

    if (options.text.trim().length === 0) {
      throw createError('INVALID_INPUT', 'Text cannot be empty');
    }

    if (options.conversationHistory && !Array.isArray(options.conversationHistory)) {
      throw createError('INVALID_INPUT', 'Conversation history must be an array');
    }
  }
}

/**
 * 创建RewriteAction实例的工厂函数
 */
export function createRewriteAction(aiService: AIService): RewriteAction {
  return new RewriteAction(aiService);
}

/**
 * 执行改写操作的便捷函数
 */
export async function executeRewrite(
  text: string,
  aiService: AIService,
  options: Partial<RewriteActionOptions> = {}
): Promise<RewriteResult> {
  const action = new RewriteAction(aiService);
  return action.execute({
    text,
    conversationHistory: [],
    ...options,
  });
}
