import {
  AIResult,
  ChatMessage,
  createError,
  Diff,
  Issue,
  ErrorCode
} from '@docmate/shared';
import {
  buildPolishPrompt,
  buildTranslatePrompt,
  buildRewritePrompt
} from '../prompts';
import { TerminologyService } from '@docmate/utils';
import { ErrorHandlingService } from './ErrorHandlingService';
import { diffWords } from 'diff';

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
 * 直接调用AI服务，无需后端代理
 */
export class FrontendAIService {
  private config: FrontendAIConfig;
  private terminologyService: TerminologyService;

  constructor(config: FrontendAIConfig) {
    this.config = {
      enableStreaming: true,
      ...config
    };
    this.terminologyService = new TerminologyService();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FrontendAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 检查文本 - 简化版本
   */
  async check(text: string, options: any = {}): Promise<AIResult> {
    try {
      const { ChunkerService } = await import('./ChunkerService');
      const { ValidationService } = await import('./ValidationService');
      const vscode = await import('vscode');

      // 获取选区范围
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }

      const selection = editor.selection;
      const selectionRange = new vscode.Range(selection.start, selection.end);

      // 文本分块
      const chunks = ChunkerService.chunkText(text, selectionRange);
      if (!ChunkerService.validateChunks(chunks)) {
        throw createError(ErrorCode.INVALID_TEXT, 'Failed to chunk text');
      }

      // 并行处理chunks - 预先导入避免重复加载
      const { buildSingleChunkPrompt } = await import('../prompts/checkPrompts');
      const chunkResults = await Promise.all(
        chunks.map(async (chunk, index) => {
          try {
            const chunkPrompt = buildSingleChunkPrompt({ chunk }, options.checkRules);
            const chunkAiResponse = await this.callAIService(
              chunkPrompt,
              [],
              this.getChunkCheckToolOptions(chunk.id)
            );
            const chunkLlmResult = this.parseChunkResponse(chunkAiResponse, chunk.id);

            return {
              chunk,
              llmResult: chunkLlmResult,
              error: null
            };
          } catch (error) {
            return {
              chunk,
              llmResult: { suggestions: [] },
              error
            };
          }
        })
      );

      // 合并结果
      const allSuggestions = chunkResults.flatMap(result =>
        result.llmResult.suggestions || []
      );

      const mergedLlmResult = {
        suggestions: allSuggestions
      };

      // 验证和映射
      const diagnostics = ValidationService.validateAndMap(chunks, mergedLlmResult);

      return this.convertDiagnosticsToAIResult(diagnostics, text);

    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `Text check failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  
  /**
   * 润色文本
   */
  async polish(text: string, options: any = {}): Promise<AIResult> {
    const { focusOn = 'all', targetAudience = 'technical' } = options;
    const prompt = buildPolishPrompt(text, focusOn, targetAudience);

    try {
      const aiResponse = await this.callAIService(prompt, [], this.getPolishToolOptions());
      return this.parseAIResponse(aiResponse, 'polish', text);
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `Text polish failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 翻译文本
   */
  async translate(text: string, options: any = {}): Promise<AIResult> {
    const { sourceLanguage = 'auto', targetLanguage = 'en-US', preserveTerminology = true, context = '' } = options;
    const prompt = buildTranslatePrompt(text, sourceLanguage, targetLanguage, preserveTerminology, context);

    try {
      const aiResponse = await this.callAIService(prompt, [], this.getTranslateToolOptions());
      let result = this.parseAIResponse(aiResponse, 'translate', text, options);
      if (preserveTerminology && result.modifiedText) {
        const originalModifiedText = result.modifiedText;
        result.modifiedText = this.terminologyService.replace(result.modifiedText);
        if (originalModifiedText !== result.modifiedText) {
          result.diffs = this.calculateDiff(text, result.modifiedText);
        }
      }
      return result;
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `Text translation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 改写文本
   */
  async rewrite(text: string, instruction: string, conversationHistory: ChatMessage[] = []): Promise<AIResult> {
    const prompt = buildRewritePrompt(text, instruction, true);

    try {
      const aiResponse = await this.callAIService(prompt, conversationHistory, this.getRewriteToolOptions());
      return this.parseAIResponse(aiResponse, 'rewrite', text);
    } catch (error) {
      throw createError(ErrorCode.AI_SERVICE_ERROR, `Text rewrite failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 调用AI服务的核心方法 - 支持真正并行的请求处理
   */
  public async callAIService(
    prompt: string,
    conversationHistory: ChatMessage[] = [],
    options: {
      tools?: any[];
      toolChoice?: any;
      responseFormat?: any;
      temperature?: number;
    } = {}
  ): Promise<any> {
    // 验证配置
    if (!this.config.apiKey || !this.config.baseUrl || !this.config.model) {
      throw createError(ErrorCode.CONFIG_MISSING, 'AI service configuration is incomplete');
    }

    // 确保timeout设置合理
    const timeout = this.config.timeout || 30000; // 默认30秒

    // 构建消息列表
    const messages = [
      ...(conversationHistory || []).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];

    // 构建请求体
    const requestBody = {
      model: this.config.model,
      messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.tools ? 4000 : 2000,
      ...(options.tools && { tools: options.tools }),
      ...(options.toolChoice && { tool_choice: options.toolChoice }),
      ...(options.responseFormat && { response_format: options.responseFormat })
    };

    // 确保baseUrl以正确的端点结尾
    let endpoint = this.config.baseUrl;
    if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    // 重试机制
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeout)
        });

        if (response.ok) {
          const data = await response.json() as any;
          const choice = data.choices?.[0];
          const toolCalls = choice?.message?.tool_calls;

          if (toolCalls && toolCalls.length > 0) {
            const first = toolCalls[0];
            const argsStr = first?.function?.arguments || '{}';
            try {
              const args = JSON.parse(argsStr);
              return { tool: first.function?.name, args };
            } catch (e) {
              throw createError(ErrorCode.TOOL_CALL_PARSE_ERROR, 'Tool calling arguments JSON parse failed');
            }
          }

          const content = choice?.message?.content;
          if (!content && (!toolCalls || toolCalls.length === 0)) {
            throw createError(ErrorCode.RESPONSE_FORMAT_ERROR, 'Invalid response format from AI service');
          }

          return content || '';
        } else {
          const errorText = await response.text();
          if (attempt === this.config.maxRetries - 1) {
            throw createError(ErrorCode.AI_SERVICE_ERROR, `AI service error: ${response.status} - ${errorText}`);
          }
        }
      } catch (error) {
        if (attempt === this.config.maxRetries - 1) {
          throw createError(ErrorCode.AI_SERVICE_ERROR, `AI service call failed: ${error instanceof Error ? error.message : String(error)}`);
        }
        // 等待一段时间后重试
        const backoffTime = 1000 * (attempt + 1);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }

    throw createError(ErrorCode.AI_SERVICE_ERROR, 'AI service call failed');
  }

  /**
   * 验证配置是否有效
   */
  isConfigValid(): boolean {
    return !!(this.config.apiKey && this.config.baseUrl && this.config.model);
  }

  
  /**
   * 取消当前请求
   */
  cancelRequest(): void {
    // 简化实现，保留接口兼容性
  }

  /**
   * 解析AI响应 - 简化版本
   */
  private parseAIResponse(
    aiResponse: any,
    type: 'check' | 'polish' | 'rewrite' | 'translate',
    originalText: string,
    options: any = {}
  ): AIResult {
    try {
      let response: any;
      if (aiResponse && typeof aiResponse === 'object') {
        response = (aiResponse as any).args ?? aiResponse;
      } else if (typeof aiResponse === 'string') {
        response = JSON.parse(aiResponse);
      } else {
        response = {};
      }

      let modifiedText = originalText;
      let issues: Issue[] | undefined;
      let summary = '';
      let explanation = '';

      switch (type) {
        case 'check':
          modifiedText = response.correctedText || originalText;
          issues = (response.issues || []).map((issue: any) => ({
            type: issue.issueType || issue.type || 'TERMINOLOGY',
            severity: issue.severity || 'info',
            message: issue.message || '',
            suggestion: issue.suggestion || '',
            range: [issue.start || 0, issue.end || 0] as [number, number],
            original_text: issue.original_text || '',
            suggested_text: issue.suggested_text || issue.suggestion || ''
          }));
          summary = `发现 ${issues?.length || 0} 个问题。`;
          break;
        case 'polish':
          modifiedText = response.polishedText || originalText;
          const polishChanges = Array.isArray(response.changes) ? response.changes : [];
          summary = `进行了 ${polishChanges.length} 处润色。`;
          explanation = polishChanges.map((c: any) => c.description || c.reason).filter(Boolean).join('\n');
          break;
        case 'rewrite':
          modifiedText = response.rewrittenText || originalText;
          const rewriteChanges = Array.isArray(response.changes) ? response.changes : [];
          summary = response.summary || `已根据指令改写文本。`;
          explanation = response.explanation || '';
          break;
        case 'translate':
          modifiedText = response.translatedText || originalText;
          const sourceLang = response.sourceLanguage || options.sourceLanguage || 'auto';
          const targetLang = response.targetLanguage || options.targetLanguage || 'en';
          summary = `从 ${sourceLang} 翻译为 ${targetLang}。`;
          break;
      }

      return {
        type,
        originalText,
        modifiedText,
        diffs: this.calculateDiff(originalText, modifiedText),
        issues,
        changes: (response as any).changes,
        summary,
        explanation
      } as any;
    } catch (error) {
      throw createError(ErrorCode.RESPONSE_FORMAT_ERROR, `Failed to parse ${type} response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  
  private parseChunkResponse(aiResponse: any, expectedChunkId: string): any {
    try {
      let response: any;
      if (aiResponse && typeof aiResponse === 'object') {
        response = (aiResponse as any).args ?? aiResponse;
      } else if (typeof aiResponse === 'string') {
        response = JSON.parse(aiResponse);
      } else {
        response = {};
      }

      if (expectedChunkId && response.chunk_id !== expectedChunkId) {
        response.chunk_id = expectedChunkId;
      }

      if (Array.isArray(response.suggestions)) {
        response.suggestions = response.suggestions.map((suggestion: any) => ({
          chunk_id: suggestion.chunk_id || expectedChunkId,
          type: suggestion.type,
          description: suggestion.description,
          original_text: suggestion.original_text,
          suggested_text: suggestion.suggested_text,
          severity: suggestion.severity
        }));
      } else {
        response.suggestions = [];
      }

      return response;
    } catch (error) {
      throw createError(ErrorCode.RESPONSE_FORMAT_ERROR, 'Failed to parse chunk response');
    }
  }

  
  /**
   * 计算文本差异 - 使用diff库的高效算法
   */
  private calculateDiff(originalText: string, modifiedText: string): Diff[] {
    if (originalText === modifiedText) {
      return [{ type: 'equal', value: originalText }];
    }

    const wordDiff = diffWords(originalText, modifiedText);
    const result: Diff[] = wordDiff.map(part => {
      if (part.added) {
        return { type: 'insert', value: part.value };
      } else if (part.removed) {
        return { type: 'delete', value: part.value };
      } else {
        return { type: 'equal', value: part.value };
      }
    });

    return this.mergeDiffs(result);
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

  /**
   * 获取chunk检查工具选项 - 简化版本
   */
  private getChunkCheckToolOptions(chunkId: string) {
    return {
      tools: [
        {
          type: 'function',
          function: {
            name: 'return_chunk_check_result',
            description: '返回文本块检查的结构化结果',
            parameters: {
              type: 'object',
              properties: {
                chunk_id: { type: 'string', description: '被检查的文本块的唯一标识符' },
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      chunk_id: { type: 'string', description: '被检查的文本块的唯一标识符' },
                      type: { type: 'string', enum: ['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'HYPERLINK_ERROR', 'TERMINOLOGY'] },
                      description: { type: 'string', description: '对问题的简短描述' },
                      original_text: { type: 'string', description: '核心文本中的错误部分' },
                      suggested_text: { type: 'string', description: '修改后的正确文本' },
                      severity: { type: 'string', enum: ['error', 'warning', 'info'], description: '严重程度' }
                    },
                    required: ['chunk_id', 'type', 'description', 'original_text', 'suggested_text', 'severity']
                  }
                }
              },
              required: ['chunk_id', 'suggestions']
            }
          }
        }
      ],
      toolChoice: { type: 'function', function: { name: 'return_chunk_check_result' } },
      temperature: 0.1
    };
  }

  // 删除复杂的getCheckToolOptions方法

  private getPolishToolOptions() {
    return {
      tools: [{
        type: 'function',
        function: {
          name: 'return_polish_result',
          description: '返回文本润色的结构化结果',
          parameters: {
            type: 'object',
            properties: {
              polishedText: { type: 'string' },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['clarity','conciseness','tone','structure','grammar'] },
                    description: { type: 'string' },
                    originalText: { type: 'string' },
                    polishedText: { type: 'string' },
                    reason: { type: 'string' }
                  },
                  required: ['type','description']
                }
              }
            },
            required: ['polishedText']
          }
        }
      }],
      toolChoice: { type: 'function', function: { name: 'return_polish_result' } },
      temperature: 0.1
    };
  }

  private getRewriteToolOptions() {
    return {
      tools: [{
        type: 'function',
        function: {
          name: 'return_rewrite_result',
          description: '返回文本改写的结构化结果',
          parameters: {
            type: 'object',
            properties: {
              rewrittenText: { type: 'string' },
              changes: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    type: { type: 'string', enum: ['content','structure','style','tone'] },
                    description: { type: 'string' },
                    originalText: { type: 'string' },
                    rewrittenText: { type: 'string' },
                    reason: { type: 'string' }
                  },
                  required: ['type','description','reason']
                }
              },
              summary: { type: 'string' },
              explanation: { type: 'string' }
            },
            required: ['rewrittenText','changes','summary','explanation']
          }
        }
      }],
      toolChoice: { type: 'function', function: { name: 'return_rewrite_result' } },
      temperature: 0.1
    };
  }


  private getTranslateToolOptions() {
    return {
      tools: [{
        type: 'function',
        function: {
          name: 'return_translate_result',
          description: '返回文本翻译的结构化结果',
          parameters: {
            type: 'object',
            properties: {
              translatedText: { type: 'string' },
              sourceLanguage: { type: 'string' },
              targetLanguage: { type: 'string' },
              terminology: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    original: { type: 'string' },
                    translated: { type: 'string' },
                    note: { type: 'string' }
                  },
                  required: ['original','translated']
                }
              }
            },
            required: ['translatedText']
          }
        }
      }],
      toolChoice: { type: 'function', function: { name: 'return_translate_result' } },
      temperature: 0.1
    };
  }

  /**
   * 将DiagnosticInfo转换为AIResult格式（保持向后兼容）
   */
  private convertDiagnosticsToAIResult(diagnostics: any[], originalText: string): AIResult {
    // 创建修改后的文本
    let modifiedText = originalText;

    // 按位置倒序排序，避免位置偏移
    const sortedDiagnostics = [...diagnostics].sort((a, b) => {
      const aStart = a.range.start.line * 1000 + a.range.start.character;
      const bStart = b.range.start.line * 1000 + b.range.start.character;
      return bStart - aStart;
    });

    // 应用所有修改
    for (const diagnostic of sortedDiagnostics) {
      if (diagnostic.original_text && diagnostic.suggested_text) {
        modifiedText = modifiedText.replace(
          diagnostic.original_text,
          diagnostic.suggested_text
        );
      }
    }

    // 构建issues
    const issues = diagnostics.map(diagnostic => ({
      type: diagnostic.suggestion_type,
      severity: diagnostic.severity,
      message: diagnostic.message,
      suggestion: diagnostic.suggested_text,
      range: [diagnostic.range.start.line, diagnostic.range.end.line] as [number, number],
      original_text: diagnostic.original_text,
      suggested_text: diagnostic.suggested_text
    }));

    // 构建diffs
    const diffs = this.calculateDiff(originalText, modifiedText);

    return {
      type: 'check',
      originalText,
      modifiedText,
      diffs,
      issues,
      summary: `发现 ${issues.length} 个问题`,
      explanation: '进行精确的文本检查'
    };
  }

}
