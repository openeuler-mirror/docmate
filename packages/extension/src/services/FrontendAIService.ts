import {
  AIResult,
  ChatMessage,
  createError,
  Diff,
  Issue,
  ErrorCode
} from '@docmate/shared';
import { TerminologyService } from '@docmate/utils';
import { ErrorHandlingService } from './ErrorHandlingService';
import { diffWords } from 'diff';

// Diff类型定义
interface DiffChange {
  value: string;
  added?: boolean;
  removed?: boolean;
}
import { LangChainService } from '../langchain/LangChainService';

/**
 * 前端AI服务配置接口
 */
export interface FrontendAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeout: number;
  maxRetries: number;
  enableStreaming?: boolean;
}

/**
 * 流式响应回调接口
 */
export interface StreamingCallbacks {
  onStart?: () => void;
  onChunk?: (chunk: string) => void;
  onComplete?: (fullResponse: string) => void;
  onError?: (error: Error) => void;
  onRetry?: (attempt: number, maxRetries: number) => void;
}

/**
 * 前端AI服务
 * 使用LangChain框架管理AI交互，移除手写的API调用和响应解析代码
 */
export class FrontendAIService {
  private config: FrontendAIConfig;
  private langChainService: LangChainService;
  private terminologyService: TerminologyService;

  constructor(config: FrontendAIConfig) {
    this.config = {
      enableStreaming: true,
      ...config
    };

    // 初始化LangChain服务
    this.langChainService = new LangChainService({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeout: config.timeout,
      maxRetries: config.maxRetries
    });

    this.terminologyService = new TerminologyService();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FrontendAIConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新LangChain服务配置
    this.langChainService.updateConfig({
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      timeout: config.timeout,
      maxRetries: config.maxRetries
    });
  }

  /**
   * 检查文本 - 使用LangChain Map-Reduce实现
   */
  async check(text: string, options: any = {}): Promise<AIResult> {
    try {
      const checkRules = options.checkRules || options.customRules || [];
      const result = await this.langChainService.check(text, checkRules);

      // 生成修改后的文本和diffs，用于diff视图显示
      const { modifiedText, diffs } = this.generateTextAndDiffs(text, result.issues);

      return {
        type: 'check',
        originalText: text,
        modifiedText,
        diffs,
        issues: result.issues,
        summary: result.summary || `发现 ${result.issues.length} 个问题`,
        explanation: '进行精确的文本检查'
      };
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `检查失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  
  /**
   * 润色文本 - 使用LangChain实现
   */
  async polish(text: string, options: any = {}): Promise<AIResult> {
    try {
      const focusOn = options.focusOn || 'all';
      const targetAudience = options.targetAudience || 'technical';

      const result = await this.langChainService.polish(text, focusOn, targetAudience);

      // 转换为AIResult格式
      const rawDiffs = diffWords(text, result.polishedText);
      const diffs: Diff[] = rawDiffs.map(diff => ({
        type: diff.added ? 'insert' : diff.removed ? 'delete' : 'equal',
        value: diff.value
      }));

      return {
        type: 'polish',
        originalText: text,
        modifiedText: result.polishedText,
        diffs,
        changes: result.changes?.map(change => ({
          type: change.type,
          original: change.original,
          improved: change.improved,
          description: `${change.original} → ${change.improved}`,
          reason: change.reason
        })) || [],
        summary: result.summary || '文本润色完成',
        explanation: result.changes?.map(c => c.reason).join('; ') || '无详细说明'
      };
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `润色失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 翻译文本 - 使用LangChain实现
   */
  async translate(text: string, options: any = {}): Promise<AIResult> {
    try {
      const targetLanguage = options.targetLanguage || 'en';
      const sourceLanguage = options.sourceLanguage || 'auto';
      const preserveTerminology = options.preserveTerminology !== false;
      const context = options.context || '';

      const result = await this.langChainService.translate(
        text,
        targetLanguage,
        sourceLanguage,
        preserveTerminology,
        context
      );

      // 转换为AIResult格式
      const rawDiffs = diffWords(text, result.translatedText);
      const diffs: Diff[] = rawDiffs.map(diff => ({
        type: diff.added ? 'insert' : diff.removed ? 'delete' : 'equal',
        value: diff.value
      }));

      return {
        type: 'translate',
        originalText: text,
        modifiedText: result.translatedText,
        diffs,
        changes: result.terminology?.map(term => ({
          type: 'terminology',
          original: term.original,
          improved: term.translated,
          description: `术语翻译: ${term.original} → ${term.translated}`,
          reason: term.note || '术语一致性'
        })) || [],
        summary: `翻译完成 (${result.sourceLang} → ${result.targetLang})`,
        explanation: `翻译质量信心度: ${result.confidence || 0.9}`,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        terminology: result.terminology
      };
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `翻译失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 改写文本 - 使用LangChain实现
   */
  async rewrite(text: string, instruction: string, conversationHistory: ChatMessage[] = []): Promise<AIResult> {
    try {
      const preserveTerminology = true; // 默认保持术语

      const result = await this.langChainService.rewrite(text, instruction, preserveTerminology);

      // 转换为AIResult格式
      const rawDiffs = diffWords(text, result.rewrittenText);
      const diffs: Diff[] = rawDiffs.map(diff => ({
        type: diff.added ? 'insert' : diff.removed ? 'delete' : 'equal',
        value: diff.value
      }));

      return {
        type: 'rewrite',
        originalText: text,
        modifiedText: result.rewrittenText,
        diffs,
        changes: result.changes?.map(change => ({
          type: change.type,
          original: change.original,
          rewritten: change.rewritten,
          description: `${change.original} → ${change.rewritten}`,
          reason: change.reason
        })) || [],
        summary: result.summary || '文本重写完成',
        explanation: result.changes?.map(c => c.reason).join('; ') || '无详细说明'
      };
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `改写失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 验证配置是否有效
   */
  isConfigValid(): boolean {
    return this.langChainService.isConfigValid();
  }

  
  /**
   * 获取LangChain服务实例（供其他组件使用）
   */
  getLangChainService(): LangChainService {
    return this.langChainService;
  }

  /**
   * 生成修改后的文本和diffs
   */
  private generateTextAndDiffs(originalText: string, issues: any[]): { modifiedText: string; diffs: Diff[] } {
    // 创建修改后的文本
    let modifiedText = originalText;

    // 按位置倒序排序，避免位置偏移
    const sortedIssues = [...issues].sort((a, b) => {
      const aStart = a.range[0] * 1000 + (a.range[1] || 0);
      const bStart = b.range[0] * 1000 + (b.range[1] || 0);
      return bStart - aStart;
    });

    // 应用所有修改
    for (const issue of sortedIssues) {
      if (issue.original_text && issue.suggested_text) {
        modifiedText = modifiedText.replace(
          issue.original_text,
          issue.suggested_text
        );
      }
    }

    // 使用diff库计算差异
    const wordDiff = diffWords(originalText, modifiedText);
    const diffs: Diff[] = wordDiff.map(part => {
      if (part.added) {
        return { type: 'insert', value: part.value };
      } else if (part.removed) {
        return { type: 'delete', value: part.value };
      } else {
        return { type: 'equal', value: part.value };
      }
    });

    return { modifiedText, diffs: this.mergeDiffs(diffs) };
  }


  /**
   * 合并相邻的相同类型的diff
   */
  private mergeDiffs(diffs: any[]): Diff[] {
    if (diffs.length === 0) return diffs as Diff[];

    const merged: Diff[] = [];
    let current: Diff = { ...diffs[0] };

    for (let i = 1; i < diffs.length; i++) {
      const diff = diffs[i];
      if (diff.type === current.type) {
        current.value += diff.value;
      } else {
        merged.push(current);
        current = { ...diff };
      }
    }
    merged.push(current);

    return merged;
  }
}
