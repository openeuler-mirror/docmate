import {
  AIResult,
  ChatMessage,
  createError,
  Diff,
  Issue,
  ErrorCode
} from '@docmate/shared';
import {
  buildCheckPrompt,
  buildPolishPrompt,
  buildTranslatePrompt,
  buildRewritePrompt
} from '../prompts';
import { TerminologyService } from '@docmate/utils';
import { ErrorHandlingService } from './ErrorHandlingService';

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
  private abortController: AbortController | null = null;

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
   * 检查文本 - v1.2新版结构化实现
   */
  async check(text: string, options: any = {}): Promise<AIResult> {
    const {
      enableGrammar = true,
      enableStyle = true,
      enableTerminology = true,
      enableConsistency = true,
      strictMode = false,
      useV12Architecture = false  // 新增：是否使用v1.2架构
    } = options;

    if (useV12Architecture) {
      // 使用v1.2新架构
      return this.checkWithV12Architecture(text, options);
    } else {
      // 使用原有架构（保持向后兼容）
      return this.checkWithLegacyArchitecture(text, options);
    }
  }

  /**
   * 使用v1.2架构进行文本检查
   */
  private async checkWithV12Architecture(text: string, options: any): Promise<AIResult> {
    const {
      enableGrammar = true,
      enableStyle = true,
      enableTerminology = true,
      enableConsistency = true,
    } = options;

    // === 调试信息：v1.2架构检查开始 ===
    console.log('\n=== FrontendAIService v1.2 Debug Info ===');
    console.log('Input text length:', text.length);
    console.log('Input text preview:', JSON.stringify(text.substring(0, 200)) + (text.length > 200 ? '...' : ''));
    console.log('Options:', options);

    try {
      // 导入v1.2相关服务
      const { ChunkerService } = await import('./ChunkerService');
      const { ValidationService } = await import('./ValidationService');
      const vscode = await import('vscode');

      // 1. 获取选区范围
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor found');
      }

      const selection = editor.selection;
      const selectionRange = new vscode.Range(selection.start, selection.end);
      console.log('Selection range:', selectionRange);

      // 2. 文本分块
      console.log('\n--- Starting Text Chunking ---');
      const chunks = ChunkerService.chunkText(text, selectionRange);
      console.log('Chunking completed, total chunks:', chunks.length);

      if (!ChunkerService.validateChunks(chunks)) {
        throw ErrorHandlingService.createError(ErrorCode.INVALID_TEXT, 'Failed to chunk text');
      }

      // 3. 并行处理chunks - 真正的并行实现

      console.log('\n=== Starting Parallel Chunk Processing ===');
      const startTime = Date.now();

      const chunkPromises = chunks.map(async (chunk, index) => {
        const chunkRequestId = `chunk-${chunk.id}-${index}`;
        try {
          console.log(`\n[${chunkRequestId}] === Processing Chunk ${index + 1}/${chunks.length} ===`);
          console.log(`[${chunkRequestId}] Chunk ID: ${chunk.id}`);
          console.log(`[${chunkRequestId}] Chunk core text: ${JSON.stringify(chunk.core_text)}`);
          console.log(`[${chunkRequestId}] Chunk context_before: ${chunk.context_before ? JSON.stringify(chunk.context_before) : '[none]'}`);
          console.log(`[${chunkRequestId}] Chunk context_after: ${chunk.context_after ? JSON.stringify(chunk.context_after) : '[none]'}`);
          console.log(`[${chunkRequestId}] Chunk range:`, chunk.range);

          // 为单个chunk构建prompt
          const { buildSingleChunkPrompt } = await import('../prompts/checkPrompts');
          const chunkPayload = {
            chunk
          };
          console.log(`[${chunkRequestId}] Chunk payload:`, chunkPayload);

          const chunkPrompt = buildSingleChunkPrompt(chunkPayload);
          console.log(`[${chunkRequestId}] Generated prompt length: ${chunkPrompt.length}`);
          console.log(`[${chunkRequestId}] Generated prompt preview: ${chunkPrompt.substring(0, 200)}...`);

          // 调用AI服务处理单个chunk - 使用新的tools调用方式
          console.log(`[${chunkRequestId}] Calling AI service for chunk ${index + 1}...`);
          const chunkAiResponse = await this.callAIService(
            chunkPrompt,
            [],
            this.getV12StructuredCheckToolOptions(chunkRequestId, chunk.id)
          );
          console.log(`[${chunkRequestId}] AI response for chunk ${index + 1}:`, JSON.stringify(chunkAiResponse).substring(0, 500) + '...');

          // 解析响应，传入expectedChunkId确保chunk_id正确
          const chunkLlmResult = this.parseStructuredAIResponse(chunkAiResponse, chunk.id);
          console.log(`[${chunkRequestId}] Parsed LLM result for chunk ${index + 1}:`, chunkLlmResult);

          return {
            chunk,
            llmResult: chunkLlmResult,
            prompt: chunkPrompt,
            response: chunkAiResponse,
            error: null,
            processingTime: Date.now() - startTime
          };

        } catch (error) {
          console.error(`[${chunkRequestId}] Chunk ${index} processing failed:`, error);
          return {
            chunk,
            llmResult: { suggestions: [] },
            prompt: '',
            response: '',
            error: error,
            processingTime: Date.now() - startTime
          };
        }
      });

      // 等待所有chunk处理完成
      const chunkResults = await Promise.all(chunkPromises);

      const parallelProcessingTime = Date.now() - startTime;
      console.log(`\n=== Parallel Processing Completed ===`);
      console.log(`Total parallel processing time: ${parallelProcessingTime}ms`);
      console.log(`Average time per chunk: ${Math.round(parallelProcessingTime / chunks.length)}ms`);
      console.log(`Chunks processed successfully: ${chunkResults.filter(r => !r.error).length}/${chunks.length}`);

      console.log('\n=== Chunk Processing Results ===');
      chunkResults.forEach((result, index) => {
        console.log(`Chunk ${index + 1} result:`, {
          success: !result.error,
          processingTime: result.processingTime,
          suggestionsCount: result.llmResult.suggestions?.length || 0,
          error: result.error ? result.error.message : null,
          suggestions: result.llmResult.suggestions?.map(s => ({
            type: s.type,
            description: s.description,
            original_text: s.original_text,
            suggested_text: s.suggested_text
          }))
        });
      });

      // 4. 合并结果
      const allSuggestions = chunkResults.flatMap(result =>
        result.llmResult.suggestions || []
      );

      console.log('\n=== Merged Suggestions ===');
      console.log('Total suggestions before validation:', allSuggestions.length);
      console.log('All suggestions:', allSuggestions.map((s, i) => ({
        index: i,
        chunk_id: s.chunk_id,
        type: s.type,
        description: s.description,
        original_text: s.original_text,
        suggested_text: s.suggested_text
      })));

      const mergedLlmResult = {
        suggestions: allSuggestions
      };

      // 5. 验证和映射
      console.log('\n--- Starting Validation and Mapping ---');
      const diagnostics = ValidationService.validateAndMap(chunks, mergedLlmResult);
      console.log('Validation completed, valid diagnostics:', diagnostics.length);
      console.log('Diagnostics details:', diagnostics.map((d, i) => ({
        index: i,
        message: d.message,
        severity: d.severity,
        range: d.range,
        original_text: d.original_text,
        suggested_text: d.suggested_text
      })));

      
      // 6. 转换为AIResult格式（保持向后兼容）
      const result = this.convertDiagnosticsToAIResult(diagnostics, text);
      console.log('\n=== Final AI Result ===');
      console.log('Issues found:', result.issues?.length || 0);
      console.log('AI result:', result);

      return result;

    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
      ErrorHandlingService.logError(docMateError, 'FrontendAIService.checkWithV12Architecture');
      throw ErrorHandlingService.createContextualError(
        docMateError.code as ErrorCode,
        `V1.2 text check failed: ${docMateError.message}`,
        'FrontendAIService.checkWithV12Architecture'
      );
    }
  }

  /**
   * 使用原有架构进行文本检查（向后兼容）
   */
  private async checkWithLegacyArchitecture(text: string, options: any): Promise<AIResult> {
    const {
      enableGrammar = true,
      enableStyle = true,
      enableTerminology = true,
      enableConsistency = true,
      strictMode = false
    } = options;

    // 构建检查类型列表
    const checkTypes: string[] = [];
    if (enableGrammar) checkTypes.push('语法错误');
    if (enableStyle) checkTypes.push('写作风格');
    if (enableTerminology) checkTypes.push('术语使用');
    if (enableConsistency) checkTypes.push('内容一致性');

    const { buildCheckPrompt } = await import('../prompts/checkPrompts');
    const prompt = buildCheckPrompt(text, checkTypes, strictMode);

    try {
      const aiResponse = await this.callAIService(prompt, [], this.getCheckToolOptions());
      return this.parseAIResponse(aiResponse, 'check', text);
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
      ErrorHandlingService.logError(docMateError, 'FrontendAIService.checkWithLegacyArchitecture');
      throw ErrorHandlingService.createContextualError(
        docMateError.code as ErrorCode,
        `Text check failed: ${docMateError.message}`,
        'FrontendAIService.checkWithLegacyArchitecture'
      );
    }
  }

  /**
   * 润色文本
   */
  async polish(text: string, options: any = {}): Promise<AIResult> {
    const {
      focusOn = 'all',
      targetAudience = 'technical'
    } = options;

    const prompt = buildPolishPrompt(text, focusOn, targetAudience);

    try {
      const aiResponse = await this.callAIService(prompt, [], this.getPolishToolOptions());
      return this.parseAIResponse(aiResponse, 'polish', text);
    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
      ErrorHandlingService.logError(docMateError, 'FrontendAIService.polish');
      throw ErrorHandlingService.createContextualError(
        docMateError.code as ErrorCode,
        `Text polish failed: ${docMateError.message}`,
        'FrontendAIService.polish'
      );
    }
  }

  /**
   * 翻译文本
   */
  async translate(text: string, options: any = {}): Promise<AIResult> {
    const {
      sourceLanguage = 'auto',
      targetLanguage = 'en-US',
      preserveTerminology = true,
      context = ''
    } = options;

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
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
      ErrorHandlingService.logError(docMateError, 'FrontendAIService.translate');
      throw ErrorHandlingService.createContextualError(
        docMateError.code as ErrorCode,
        `Text translation failed: ${docMateError.message}`,
        'FrontendAIService.translate'
      );
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
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
      ErrorHandlingService.logError(docMateError, 'FrontendAIService.rewrite');
      throw ErrorHandlingService.createContextualError(
        docMateError.code as ErrorCode,
        `Text rewrite failed: ${docMateError.message}`,
        'FrontendAIService.rewrite'
      );
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
      requestId?: string; // 用于标识并行请求的唯一ID
    } = {}
  ): Promise<any> {
    const requestId = options.requestId || `req-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    // 验证配置
    const missingFields = [];
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      missingFields.push('API Key');
    }
    if (!this.config.baseUrl || this.config.baseUrl.trim() === '') {
      missingFields.push('Base URL');
    }
    if (!this.config.model || this.config.model.trim() === '') {
      missingFields.push('Model');
    }

    if (missingFields.length > 0) {
      throw ErrorHandlingService.createError(
        ErrorCode.CONFIG_MISSING,
        `AI service configuration is incomplete. Missing: ${missingFields.join(', ')}. Please configure in settings.`
      );
    }

    // 构建消息列表
    const messages: Array<{ role: string; content: string }> = [];

    // 添加对话历史
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        });
      }
    }

    // 添加当前提示词
    messages.push({ role: 'user', content: prompt });

    // 构建请求体
    const requestBody: any = {
      model: this.config.model,
      messages: messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.tools ? 4000 : 2000, // tools调用需要更多tokens
    };

    if (options.tools) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.toolChoice ?? 'required';
    }
    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }

    // 确保baseUrl以正确的端点结尾
    let endpoint = this.config.baseUrl;
    if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    console.log(`[${requestId}] Starting AI call with tools: ${!!options.tools}, responseFormat: ${!!options.responseFormat}`);

    // 重试机制
    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      try {
        console.log(`[${requestId}] Attempting AI call (${attempt + 1}/${this.config.maxRetries})`);

        // 为每个请求创建独立的AbortController，避免并行请求间的干扰
        const requestAbortController = new AbortController();

        // 设置超时
        const timeoutId = setTimeout(() => {
          requestAbortController.abort();
        }, this.config.timeout!);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: requestAbortController.signal
        });

        // 清除超时
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json() as any;
          const choice = data.choices?.[0];
          const toolCalls = choice?.message?.tool_calls;

          if (toolCalls && toolCalls.length > 0) {
            const first = toolCalls[0];
            const argsStr = first?.function?.arguments || '{}';
            try {
              // 增强的 JSON 解析，处理特殊字符
              const args = this.parseToolCallArguments(argsStr);
              console.log(`[${requestId}] Tool call successful: ${first.function?.name}`);
              return { tool: first.function?.name, args };
            } catch (e) {
              console.error(`[${requestId}] Tool calling arguments parse error:`, e, 'Raw args:', argsStr);
              throw ErrorHandlingService.createError(ErrorCode.TOOL_CALL_PARSE_ERROR, `Tool calling arguments JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
            }
          }

          const content = choice?.message?.content;

          // 如果没有content但有tool calls，说明AI使用了工具调用
          if (!content && (!toolCalls || toolCalls.length === 0)) {
            const error = ErrorHandlingService.createError(
              ErrorCode.RESPONSE_FORMAT_ERROR,
              'Invalid response format from AI service: no content or tool calls'
            );
            ErrorHandlingService.logError(error, `[${requestId}] FrontendAIService.callAIService - Invalid Response`);
            throw error;
          }

          console.log(`[${requestId}] AI call successful`, {
            attempt: attempt + 1,
            responseLength: content?.length || 0,
            hasToolCalls: toolCalls?.length > 0
          });

          return content || '';
        } else {
          const errorText = await response.text();
          const error = ErrorHandlingService.createError(
            ErrorCode.AI_SERVICE_ERROR,
            `AI service error: ${response.status} - ${errorText}`
          );
          ErrorHandlingService.logError(error, `[${requestId}] FrontendAIService.callAIService - Attempt ${attempt + 1}`);

          if (attempt === this.config.maxRetries - 1) {
            throw error;
          }
        }
      } catch (error) {
        const docMateError = ErrorHandlingService.fromError(error, ErrorCode.AI_SERVICE_ERROR);
        ErrorHandlingService.logError(docMateError, `[${requestId}] FrontendAIService.callAIService - Attempt ${attempt + 1}`);

        if (attempt === this.config.maxRetries - 1) {
          // 最后一次重试失败，保留原始错误码，只添加重试信息
          const finalError = ErrorHandlingService.createContextualError(
            docMateError.code as ErrorCode,
            `${ErrorHandlingService.getFriendlyMessage(docMateError)} (重试${this.config.maxRetries}次后失败)`,
            'FrontendAIService.callAIService'
          );
          throw finalError;
        }

        // 等待一段时间后重试，使用随机退避避免并发请求的同步重试
        const backoffTime = 1000 * (attempt + 1) * (0.8 + Math.random() * 0.4);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      }
    }

    throw ErrorHandlingService.createError(ErrorCode.AI_SERVICE_ERROR, 'AI service call failed');
  }

  /**
   * 验证配置是否有效
   */
  isConfigValid(): boolean {
    return !!(this.config.apiKey && this.config.baseUrl && this.config.model);
  }

  /**
   * 获取当前配置
   */
  getConfig(): FrontendAIConfig {
    return { ...this.config };
  }

  /**
   * 取消当前请求
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }



  /**
   * 流式调用AI服务
   */
  async callAIServiceStreaming(
    prompt: string,
    conversationHistory: ChatMessage[] = [],
    callbacks: StreamingCallbacks = {},
    options: {
      tools?: any[];
      toolChoice?: any;
      responseFormat?: any;
      temperature?: number;
    } = {}
  ): Promise<string> {
    // 验证配置
    const missingFields = [];
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      missingFields.push('API Key');
    }
    if (!this.config.baseUrl || this.config.baseUrl.trim() === '') {
      missingFields.push('Base URL');
    }
    if (!this.config.model || this.config.model.trim() === '') {
      missingFields.push('Model');
    }

    if (missingFields.length > 0) {
      throw createError(
        'CONFIG_MISSING' as any,
        `AI service configuration is incomplete. Missing: ${missingFields.join(', ')}. Please configure in settings.`
      );
    }

    // 创建新的AbortController
    this.abortController = new AbortController();

    try {
      callbacks.onStart?.();

      const response = await this.makeStreamingRequest(
        prompt,
        conversationHistory,
        options,
        callbacks
      );

      callbacks.onComplete?.(response);
      return response;
    } catch (error) {
      callbacks.onError?.(error as Error);
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 执行流式请求
   */
  private async makeStreamingRequest(
    prompt: string,
    conversationHistory: ChatMessage[],
    options: any,
    callbacks: StreamingCallbacks
  ): Promise<string> {
    const messages = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      { role: 'user', content: prompt }
    ];

    const requestBody = {
      model: this.config.model,
      messages,
      stream: this.config.enableStreaming,
      temperature: options.temperature || 0.7,
      ...(options.tools && { tools: options.tools }),
      ...(options.toolChoice && { tool_choice: options.toolChoice }),
      ...(options.responseFormat && { response_format: options.responseFormat })
    };

    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`
      },
      body: JSON.stringify(requestBody),
      signal: this.abortController?.signal
    });

    if (!response.ok) {
      throw ErrorHandlingService.createError(ErrorCode.AI_SERVICE_ERROR, `HTTP ${response.status}: ${response.statusText}`);
    }

    if (!this.config.enableStreaming || !response.body) {
      // 非流式响应
      const data: any = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      callbacks.onChunk?.(content);
      return content;
    }

    // 流式响应处理
    return this.processStreamingResponse(response, callbacks);
  }

  /**
   * 处理流式响应
   */
  private async processStreamingResponse(
    response: Response,
    callbacks: StreamingCallbacks
  ): Promise<string> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim() === '') continue;
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullResponse += content;
                callbacks.onChunk?.(content);
              }
            } catch (e) {
              console.warn('Failed to parse SSE data:', data);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullResponse;
  }

  /**
   * 解析AI响应 - 统一的解析方法
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
        // tool-calling 返回 { tool, args }
        response = (aiResponse as any).args ?? aiResponse;
      } else if (typeof aiResponse === 'string') {
        response = this.extractJsonFromResponse(aiResponse);
      } else {
        response = {};
      }

      let modifiedText = originalText;
      let issues: Issue[] | undefined;
      let summary = '';
      let explanation = '';

      let sourceLang: string | undefined;
      let targetLang: string | undefined;

      switch (type) {
        case 'check':
          modifiedText = response.correctedText || originalText;
          // 添加调试日志
          if (response.correctedText && response.correctedText !== originalText) {
            console.log('Check result - Original text length:', originalText.length);
            console.log('Check result - Modified text length:', response.correctedText.length);
            console.log('Check result - Modified text preview:', response.correctedText.substring(0, 200) + '...');
          }
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
          // explanation 作为补充说明，保留每条的 description/reason
          explanation = polishChanges.map((c: any) => c.description || c.reason).filter(Boolean).join('\n');
          (response as any).changes = polishChanges;
          break;
        case 'rewrite':
          modifiedText = response.rewrittenText || originalText;
          const rewriteChanges = Array.isArray(response.changes) ? response.changes : [];
          summary = response.summary || `已根据指令改写文本。`;
          explanation = response.explanation || '';
          (response as any).changes = rewriteChanges;
          break;
        case 'translate':
          modifiedText = response.translatedText || originalText;
          sourceLang =
            response.sourceLanguage || options.sourceLanguage || 'auto';
          targetLang = response.targetLanguage || options.targetLanguage || 'en';
          summary = `从 ${sourceLang} 翻译为 ${targetLang}。`;
          // 保留术语数组以供UI展示，不拼接进 explanation，避免与其他说明冲突
          (response.terminology || []).forEach((t: any) => {
            // 轻量校验字段
            if (!t.original || !t.translated) return;
          });
          (response as any).terminology = response.terminology || [];
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
        explanation,
        sourceLang,
        targetLang,
        // 传递术语数组用于 UI 展示（仅 translate 场景存在）
        terminology: (response as any).terminology
      } as any;
    } catch (error) {
      console.error(`Failed to parse ${type} response:`, error, 'Raw response:', aiResponse);
      // 不要返回"成功"的结果，而是抛出错误让上层处理
      throw ErrorHandlingService.createError(
        ErrorCode.RESPONSE_FORMAT_ERROR,
        `解析AI响应失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 解析 Tool Call 参数 - 增强版本，处理特殊字符
   */
  private parseToolCallArguments(argsStr: string): any {
    try {
      // 直接尝试解析
      return JSON.parse(argsStr);
    } catch (firstError) {
      console.warn('Direct JSON parse failed, trying enhanced parsing:', firstError);

      try {
        // 尝试修复常见的 JSON 问题
        let fixedArgs = argsStr;

        // 1. 修复字符串值中的控制字符
        fixedArgs = fixedArgs.replace(/"([^"]*?)"/g, (match, content) => {
          // 只处理字符串值，不处理属性名
          if (content.includes(':') && !content.includes('\n') && !content.includes('\r') && !content.includes('\t')) {
            return match; // 这可能是属性名，不要修改
          }

          let fixed = content;
          // 转义未转义的特殊字符
          fixed = fixed.replace(/\\/g, '\\\\'); // 先转义反斜杠
          fixed = fixed.replace(/"/g, '\\"');   // 转义双引号
          fixed = fixed.replace(/\n/g, '\\n');  // 转义换行符
          fixed = fixed.replace(/\r/g, '\\r');  // 转义回车符
          fixed = fixed.replace(/\t/g, '\\t');  // 转义制表符
          fixed = fixed.replace(/`/g, '\\`');   // 转义反引号

          return `"${fixed}"`;
        });

        // 2. 修复末尾多余的逗号
        fixedArgs = fixedArgs.replace(/,(\s*[}\]])/g, '$1');

        return JSON.parse(fixedArgs);
      } catch (secondError) {
        console.error('Enhanced JSON parse also failed:', secondError);

        // 最后尝试：提取可能的 JSON 对象
        try {
          const match = argsStr.match(/\{[\s\S]*\}/);
          if (match) {
            return JSON.parse(match[0]);
          }
        } catch (thirdError) {
          console.error('JSON extraction failed:', thirdError);
        }

        // 如果所有方法都失败，抛出原始错误
        throw firstError;
      }
    }
  }

  /**
   * 从AI响应中提取JSON - 统一的解析方法
   */
  private extractJsonFromResponse(response: string): any {
    console.log('Extracting JSON from response:', response);

    const sanitize = (text: string) => {
      // 去掉BOM
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      // 去除Markdown代码块围栏
      text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');
      // 统一换行
      text = text.replace(/\r\n/g, '\n');
      // 去除多余反引号
      text = text.replace(/```/g, '');
      // 去除末尾逗号（简单修复）
      text = text.replace(/,\s*([}\]])/g, '$1');
      // 替换非标准引号为标准引号（保守处理）
      text = text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");

      // 增强：修复字符串中未转义的特殊字符
      try {
        // 先尝试解析，如果失败再进行修复
        JSON.parse(text);
        return text.trim();
      } catch {
        // 修复未转义的反引号
        text = text.replace(/(?<!\\)`/g, '\\`');
        // 修复未转义的换行符
        text = text.replace(/(?<!\\)\n/g, '\\n');
        text = text.replace(/(?<!\\)\r/g, '\\r');
        // 修复未转义的制表符
        text = text.replace(/(?<!\\)\t/g, '\\t');
        return text.trim();
      }
    };

    // 策略1：直接解析完整JSON
    try {
      return JSON.parse(sanitize(response));
    } catch {}

    // 策略2：提取```json fenced代码块
    const fenced = response.match(/```json\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      try {
        return JSON.parse(sanitize(fenced[1]));
      } catch {}
    }

    // 策略3：括号栈提取最外层完整JSON
    const extractByBraceStack = (text: string): string | null => {
      let start = -1, depth = 0;
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            return text.slice(start, i + 1);
          }
        }
      }
      return null;
    };

    const byStack = extractByBraceStack(response);
    if (byStack) {
      try {
        return JSON.parse(sanitize(byStack));
      } catch {}
    }

    throw new Error('在AI响应中未找到或无法解析有效的JSON结构');
  }

  /**
   * 计算文本差异 - 使用增强的精确diff算法
   */
  private calculateDiff(originalText: string, modifiedText: string): Diff[] {
    if (originalText === modifiedText) {
      return [{ type: 'equal', value: originalText }];
    }

    // 检查原始文本是否以换行符结尾
    const originalEndsWithNewline = originalText.endsWith('\n') || originalText.endsWith('\r\n');
    const modifiedEndsWithNewline = modifiedText.endsWith('\n') || modifiedText.endsWith('\r\n');

    // 先按行级进行 LCS 对齐，再对变更的行做词级 diff，提高可读性
    let originalLines = originalText.split(/\r?\n/);
    let modifiedLines = modifiedText.split(/\r?\n/);

    // 如果文本以换行符结尾，split 会产生一个空字符串作为最后一个元素，需要移除
    if (originalEndsWithNewline && originalLines[originalLines.length - 1] === '') {
      originalLines = originalLines.slice(0, -1);
    }
    if (modifiedEndsWithNewline && modifiedLines[modifiedLines.length - 1] === '') {
      modifiedLines = modifiedLines.slice(0, -1);
    }

    const lineDiffs = this.computeLineDiff(originalLines, modifiedLines);

    // 将行级 diff 中的 equal 直接返回，将 insert/delete 的行再拆成词级 diff
    const result: Diff[] = [];
    for (let i = 0; i < lineDiffs.length; i++) {
      const ld = lineDiffs[i];
      const isLastLine = i === lineDiffs.length - 1;

      if (ld.type === 'equal') {
        // 对于最后一行，根据原始文本是否有换行符来决定是否添加换行符
        const shouldAddNewline = !isLastLine || originalEndsWithNewline;
        result.push({ type: 'equal', value: ld.value + (shouldAddNewline ? '\n' : '') });
      } else if (ld.type === 'delete') {
        // 对删除的行直接标记整行删除并保留换行
        const shouldAddNewline = !isLastLine || originalEndsWithNewline;
        result.push({ type: 'delete', value: ld.value + (shouldAddNewline ? '\n' : '') });
      } else if (ld.type === 'insert') {
        const shouldAddNewline = !isLastLine || modifiedEndsWithNewline;
        result.push({ type: 'insert', value: ld.value + (shouldAddNewline ? '\n' : '') });
      } else if (ld.type === 'replace') {
        // 行内容有替换，做增强的词级 diff
        const tokensA = this.tokenizeForDiff(ld.a);
        const tokensB = this.tokenizeForDiff(ld.b);
        const wordDiffs = this.computeWordDiff(tokensA, tokensB);
        // 合并词级 diff
        for (const wd of wordDiffs) {
          result.push(wd);
        }
        // 行尾换行
        const shouldAddNewline = !isLastLine || modifiedEndsWithNewline;
        if (shouldAddNewline) {
          result.push({ type: 'equal', value: '\n' });
        }
      }
    }

    return this.mergeDiffs(result);
  }



  /**
   * 增强的词级分词（支持中英混排）
   */
  private tokenizeForDiff(text: string): string[] {
    // 使用正则表达式分割，支持中文、英文、数字、标点
    const tokens = text.match(/[\u4e00-\u9fff]+|[a-zA-Z0-9]+|[^\u4e00-\u9fff\sa-zA-Z0-9]+|\s+/g) || [];
    return tokens.filter(token => token.length > 0);
  }

  /**
   * 计算单词级别的差异（LCS 编辑距离回溯，返回 insert/delete/equal 列表）
   */
  private computeWordDiff(original: string[], modified: string[]): any[] {
    const dp: number[][] = [];
    const m = original.length;
    const n = modified.length;

    // 初始化DP表
    for (let i = 0; i <= m; i++) {
      dp[i] = [];
      for (let j = 0; j <= n; j++) {
        if (i === 0) dp[i][j] = j;
        else if (j === 0) dp[i][j] = i;
        else if (original[i - 1] === modified[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
        }
      }
    }

    // 回溯构建diff
    const diffs: any[] = [];
    let i = m, j = n;

    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && original[i - 1] === modified[j - 1]) {
        diffs.unshift({ type: 'equal', value: original[i - 1] });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] <= dp[i - 1][j])) {
        diffs.unshift({ type: 'insert', value: modified[j - 1] });
        j--;
      } else if (i > 0) {
        diffs.unshift({ type: 'delete', value: original[i - 1] });
        i--;
      }
    }

    return diffs;
  }

  /**
   * 行级 LCS diff，支持 equal/insert/delete/replace（replace 表示同一位置的行内容变化）
   */
  private computeLineDiff(a: string[], b: string[]): Array<any> {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
        else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }

    const res: any[] = [];
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (a[i] === b[j]) {
        res.push({ type: 'equal', value: a[i] });
        i++; j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        // a[i] 被删除
        res.push({ type: 'delete', value: a[i] });
        i++;
      } else {
        // b[j] 被插入
        res.push({ type: 'insert', value: b[j] });
        j++;
      }
    }
    while (i < m) { res.push({ type: 'delete', value: a[i++] }); }
    while (j < n) { res.push({ type: 'insert', value: b[j++] }); }

    // 尝试将交替的 delete + insert 合并为 replace
    const merged: any[] = [];
    for (let k = 0; k < res.length; k++) {
      const cur = res[k];
      const next = res[k + 1];
      if (cur && next && cur.type === 'delete' && next.type === 'insert') {
        merged.push({ type: 'replace', a: cur.value, b: next.value });
        k++; // 跳过 next
      } else {
        merged.push(cur);
      }
    }

    return merged;
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

  private getCheckToolOptions() {
    return {
      tools: [
        {
          type: 'function',
          function: {
            name: 'return_check_result',
            description: '返回文本检查的结构化结果',
            parameters: {
              type: 'object',
              properties: {
                correctedText: { type: 'string', description: '修正后的完整文本' },
                issues: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      issueType: { type: 'string', enum: ['TYPO','PUNCTUATION','SPACING','FORMATTING','STYLE','HYPERLINK_ERROR','TERMINOLOGY'] },
                      severity: { type: 'string', enum: ['error','warning','info'] },
                      originalText: { type: 'string', description: '检测到问题的原始文本片段' },
                      suggestedText: { type: 'string', description: '建议修正后的文本片段' },
                      message: { type: 'string', description: '对问题的简短描述' },
                      suggestion: { type: 'string', description: '对修正的详细解释和说明' },
                      start: { type: 'number', description: '问题在原文中的起始位置索引' },
                      end: { type: 'number', description: '问题在原文中的结束位置索引' }
                    },
                    required: ['issueType','severity','originalText','suggestedText','message','suggestion','start','end']
                  }
                }
              },
              required: ['correctedText','issues']
            }
          }
        }
      ],
      toolChoice: { type: 'function', function: { name: 'return_check_result' } },
      temperature: 0.1
    };
  }

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
   * 获取v1.2结构化检查的工具选项 - 使用真正的tools调用
   */
  private getV12StructuredCheckToolOptions(requestId: string = '', chunkId: string = '') {
    return {
      tools: [
        {
          type: 'function',
          function: {
            name: 'return_chunk_check_result',
            description: '返回文本块检查的结构化结果，确保JSON格式稳定',
            parameters: {
              type: 'object',
              properties: {
                chunk_id: {
                  type: 'string',
                  description: '被检查的文本块的唯一标识符'
                },
                suggestions: {
                  type: 'array',
                  description: '检查结果建议列表',
                  items: {
                    type: 'object',
                    properties: {
                      chunk_id: {
                        type: 'string',
                        description: '被检查的文本块的唯一标识符（必须与父级chunk_id一致）'
                      },
                      type: {
                        type: 'string',
                        enum: ['TYPO', 'PUNCTUATION', 'SPACING', 'FORMATTING', 'STYLE', 'HYPERLINK_ERROR', 'TERMINOLOGY'],
                        description: '问题类型'
                      },
                      description: {
                        type: 'string',
                        description: '对问题的简短描述'
                      },
                      original_text: {
                        type: 'string',
                        description: '核心文本中的错误部分'
                      },
                      suggested_text: {
                        type: 'string',
                        description: '修改后的正确文本'
                      },
                      severity: {
                        type: 'string',
                        enum: ['error', 'warning', 'info'],
                        description: '严重程度'
                      }
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
      temperature: 0.1,
      max_tokens: 5000,
      requestId: requestId
    };
  }

  /**
   * 解析结构化AI响应（v1.2架构）- 支持tools调用和普通JSON响应，自动修复chunk_id
   */
  private parseStructuredAIResponse(aiResponse: any, expectedChunkId?: string): any {
    try {
      let response: any;
      let sourceType = '';

      if (aiResponse && typeof aiResponse === 'object') {
        // tool-calling 返回 { tool, args }
        if (aiResponse.tool && aiResponse.args) {
          response = aiResponse.args;
          sourceType = 'tool-call';
          console.log('Parsing response from tool call');
        } else {
          response = aiResponse;
          sourceType = 'direct-object';
        }
      } else if (typeof aiResponse === 'string') {
        response = this.extractJsonFromResponse(aiResponse);
        sourceType = 'extracted-json';
        console.log('Parsed JSON from string response');
      } else {
        response = {};
        sourceType = 'empty';
      }

      console.log('Response parsing details:', {
        sourceType,
        responseType: typeof response,
        hasSuggestions: Array.isArray(response?.suggestions),
        suggestionsCount: Array.isArray(response?.suggestions) ? response.suggestions.length : 0,
        expectedChunkId: expectedChunkId
      });

      // 验证响应格式
      if (!response || typeof response !== 'object') {
        throw new Error(`Invalid response format: ${typeof response}`);
      }

      // 处理tools调用返回的格式
      if (sourceType === 'tool-call') {
        // tools调用返回的格式可能直接是suggestions数组
        if (response.suggestions && Array.isArray(response.suggestions)) {
          console.log('Using suggestions from tool call response');
        } else {
          console.warn('Tool call response missing suggestions array');
          response.suggestions = [];
        }
      } else {
        // 处理普通JSON响应格式
        if (!Array.isArray(response.suggestions)) {
          console.warn('Response does not contain suggestions array, creating empty one');
          response.suggestions = [];
        }
      }

      // 自动修复chunk_id
      if (expectedChunkId) {
        console.log(`Auto-fixing chunk_id to expected value: ${expectedChunkId}`);

        // 修复顶级chunk_id
        if (!response.chunk_id || response.chunk_id !== expectedChunkId) {
          console.log(`Fixing top-level chunk_id from "${response.chunk_id}" to "${expectedChunkId}"`);
          response.chunk_id = expectedChunkId;
        }

        // 修复suggestions中的chunk_id
        for (const suggestion of response.suggestions) {
          if (!suggestion.chunk_id || suggestion.chunk_id !== expectedChunkId) {
            console.log(`Fixing suggestion chunk_id from "${suggestion.chunk_id}" to "${expectedChunkId}"`);
            suggestion.chunk_id = expectedChunkId;
          }
        }
      }

      // 验证和标准化suggestions格式
      const validSuggestions = [];
      for (const suggestion of response.suggestions) {
        if (this.isValidSuggestion(suggestion)) {
          validSuggestions.push(this.normalizeSuggestion(suggestion));
        } else {
          console.warn('Invalid suggestion format, skipping:', suggestion);
        }
      }

      response.suggestions = validSuggestions;
      console.log(`Successfully parsed ${validSuggestions.length} valid suggestions`);

      return response;
    } catch (error) {
      console.error('Failed to parse structured AI response:', error, 'Raw response:', aiResponse);
      throw ErrorHandlingService.createError(
        ErrorCode.RESPONSE_FORMAT_ERROR,
        `解析结构化AI响应失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 验证suggestion格式是否有效
   */
  private isValidSuggestion(suggestion: any): boolean {
    const requiredFields = ['type', 'description', 'original_text', 'suggested_text', 'severity'];
    return requiredFields.every(field => field in suggestion && suggestion[field] !== null && suggestion[field] !== undefined);
  }

  /**
   * 标准化suggestion格式
   */
  private normalizeSuggestion(suggestion: any): any {
    return {
      chunk_id: suggestion.chunk_id || '',
      type: suggestion.type,
      description: suggestion.description,
      original_text: suggestion.original_text,
      suggested_text: suggestion.suggested_text,
      severity: suggestion.severity
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
      explanation: '使用v1.2架构进行精确的文本检查'
    };
  }

}
