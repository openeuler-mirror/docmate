import {
  CheckResult,
  PolishResult,
  TranslateResult,
  RewriteResult,
  ChatMessage,
  createError,
  AIServiceConfig
} from '@docmate/shared';
import {
  buildCheckPrompt,
  buildPolishPrompt,
  buildTranslatePrompt,
  buildRewritePrompt
} from '../prompts';

/**
 * 前端AI服务配置接口
 */
export interface FrontendAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * 前端AI服务
 * 直接调用AI服务，无需后端代理
 */
export class FrontendAIService {
  private config: FrontendAIConfig;

  constructor(config: FrontendAIConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
      ...config
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FrontendAIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 检查文本
   */
  async check(text: string, options: any = {}): Promise<CheckResult> {
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

    const prompt = buildCheckPrompt(text, checkTypes, strictMode);

    try {
      const aiResponse = await this.callAIService(prompt);
      return this.parseCheckResponse(aiResponse, text);
    } catch (error) {
      console.error('FrontendAIService: Check failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 润色文本
   */
  async polish(text: string, options: any = {}): Promise<PolishResult> {
    const {
      focusOn = 'all',
      targetAudience = 'technical'
    } = options;

    const prompt = buildPolishPrompt(text, focusOn, targetAudience);

    try {
      const aiResponse = await this.callAIService(prompt);
      return this.parsePolishResponse(aiResponse, text);
    } catch (error) {
      console.error('FrontendAIService: Polish failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text polish failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 翻译文本
   */
  async translate(text: string, options: any = {}): Promise<TranslateResult> {
    const {
      sourceLanguage = 'auto',
      targetLanguage = 'en-US',
      preserveTerminology = true,
      context = ''
    } = options;

    const prompt = buildTranslatePrompt(text, sourceLanguage, targetLanguage, preserveTerminology, context);

    try {
      const aiResponse = await this.callAIService(prompt);
      return this.parseTranslateResponse(aiResponse, { text, sourceLanguage, targetLanguage });
    } catch (error) {
      console.error('FrontendAIService: Translate failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 改写文本
   */
  async rewrite(text: string, instruction: string, conversationHistory: ChatMessage[] = []): Promise<RewriteResult> {
    const prompt = buildRewritePrompt(text, instruction, true);

    try {
      const aiResponse = await this.callAIService(prompt, conversationHistory);
      return this.parseRewriteResponse(aiResponse, { text, instruction, conversationHistory });
    } catch (error) {
      console.error('FrontendAIService: Rewrite failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text rewrite failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 调用AI服务的核心方法
   */
  public async callAIService(
    prompt: string,
    conversationHistory: ChatMessage[] = []
  ): Promise<string> {
    // 验证配置
    if (!this.config.apiKey || !this.config.baseUrl || !this.config.model) {
      throw createError('INVALID_CONFIG', 'AI service configuration is incomplete');
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
    const requestBody = {
      model: this.config.model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 2000,
    };

    // 确保baseUrl以正确的端点结尾
    let endpoint = this.config.baseUrl;
    if (!endpoint.includes('/chat/completions')) {
      endpoint = endpoint.replace(/\/$/, '') + '/chat/completions';
    }

    // 重试机制
    for (let attempt = 0; attempt < (this.config.maxRetries || 3); attempt++) {
      try {
        console.log(`FrontendAIService: Attempting AI call (${attempt + 1}/${this.config.maxRetries})`);
        
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(this.config.timeout || 30000)
        });

        if (response.ok) {
          const data = await response.json() as any;
          const content = data.choices?.[0]?.message?.content;
          
          if (!content) {
            throw new Error('Invalid response format from AI service');
          }

          console.log('FrontendAIService: AI call successful', {
            attempt: attempt + 1,
            responseLength: content.length
          });

          return content;
        } else {
          const errorText = await response.text();
          console.warn('FrontendAIService: AI service returned error', {
            status: response.status,
            statusText: response.statusText,
            response: errorText,
            attempt: attempt + 1
          });

          if (attempt === (this.config.maxRetries || 3) - 1) {
            throw new Error(`AI service error: ${response.status} - ${errorText}`);
          }
        }
      } catch (error) {
        console.warn('FrontendAIService: Request failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          attempt: attempt + 1
        });

        if (attempt === (this.config.maxRetries || 3) - 1) {
          throw createError(
            'AI_SERVICE_ERROR',
            `AI service call failed after ${this.config.maxRetries} attempts: ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }

        // 等待一段时间后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw createError('AI_SERVICE_ERROR', 'AI service call failed');
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
   * 解析检查响应 - 统一格式
   */
  private parseCheckResponse(aiResponse: string, originalText: string): CheckResult {
    try {
      const response = this.extractJsonFromResponse(aiResponse);

      // 处理解析失败的情况
      if (response.error) {
        console.error('Check response parsing failed:', response.error);
        return {
          diffs: [],
          issues: [],
          correctedText: originalText,
          summary: '检查失败',
          hasChanges: false
        } as any;
      }

      const correctedText = response.correctedText || originalText;

      // 构建详细的issues信息
      const issues = (response.issues || []).map((issue: any) => ({
        type: issue.type || 'grammar',
        severity: issue.severity || 'info',
        message: issue.message || '',
        suggestion: issue.suggestion || '',
        range: [issue.start || 0, issue.end || 0] as [number, number],
        originalText: issue.originalText || '',
        suggestedText: issue.suggestedText || '',
        confidence: issue.confidence || 0.8
      }));

      return {
        diffs: this.calculateDiff(originalText, correctedText),
        issues: issues,
        // 添加额外信息用于UI显示
        correctedText: correctedText,
        summary: `发现 ${issues.length} 个问题`,
        hasChanges: correctedText !== originalText
      } as any;
    } catch (error) {
      console.error('Failed to parse check response:', error);
      return {
        diffs: [],
        issues: [],
        correctedText: originalText,
        summary: '检查失败',
        hasChanges: false
      } as any;
    }
  }

  /**
   * 解析润色响应 - 统一格式
   */
  private parsePolishResponse(aiResponse: string, originalText: string): PolishResult {
    try {
      const response = this.extractJsonFromResponse(aiResponse);

      // 处理解析失败的情况
      if (response.error) {
        console.error('Polish response parsing failed:', response.error);
        return {
          diffs: [],
          polishedText: originalText,
          changes: [],
          summary: '润色失败',
          hasChanges: false
        } as any;
      }

      const polishedText = response.polishedText || originalText;

      // 构建详细的changes信息
      const changes = (response.changes || []).map((change: any) => ({
        type: change.type || 'clarity',
        description: change.description || change.reason || '',
        originalText: change.originalText || change.before || '',
        polishedText: change.polishedText || change.after || '',
        reason: change.reason || change.description || ''
      }));

      return {
        diffs: this.calculateDiff(originalText, polishedText),
        // 添加额外信息用于UI显示
        polishedText: polishedText,
        changes: changes,
        summary: `进行了 ${changes.length} 处润色`,
        hasChanges: polishedText !== originalText
      } as any;
    } catch (error) {
      console.error('Failed to parse polish response:', error);
      return {
        diffs: [],
        polishedText: originalText,
        changes: [],
        summary: '润色失败',
        hasChanges: false
      } as any;
    }
  }

  /**
   * 解析翻译响应
   */
  private parseTranslateResponse(aiResponse: string, request: any): TranslateResult {
    console.log('=== TRANSLATE RESPONSE PARSING ===');
    console.log('Original AI response:', aiResponse);
    console.log('Request:', request);

    try {
      const response = this.extractJsonFromResponse(aiResponse);
      console.log('Extracted JSON response:', response);

      const translatedText = response.translatedText || request.text;

      // 构建术语信息
      const terminology = (response.terminology || []).map((term: any) => ({
        original: term.original || '',
        translated: term.translated || '',
        note: term.note || ''
      }));

      console.log('Parsed terminology:', terminology);

      return {
        diffs: this.calculateDiff(request.text, translatedText),
        sourceLang: response.sourceLanguage || request.sourceLanguage || 'auto',
        targetLang: response.targetLanguage || request.targetLanguage || 'en',
        // 添加额外信息用于UI显示
        translatedText: translatedText,
        terminology: terminology,
        summary: `从 ${response.sourceLanguage || 'auto'} 翻译为 ${response.targetLanguage || 'en'}`,
        hasChanges: translatedText !== request.text
      } as any;
    } catch (error) {
      console.error('Failed to parse translate response:', error);
      return {
        diffs: [],
        sourceLang: request.sourceLanguage || 'auto',
        targetLang: request.targetLanguage || 'en',
        translatedText: request.text,
        terminology: [],
        summary: '翻译失败',
        hasChanges: false
      } as any;
    }
  }

  /**
   * 解析改写响应 - 统一格式
   */
  private parseRewriteResponse(aiResponse: string, request: any): RewriteResult {
    console.log('=== REWRITE RESPONSE PARSING ===');
    console.log('Original AI response:', aiResponse);
    console.log('Request text:', request.text);

    try {
      const response = this.extractJsonFromResponse(aiResponse);
      console.log('Extracted JSON response:', response);

      // 处理解析失败的情况
      if (response.error) {
        console.error('Rewrite response parsing failed:', response.error);
        console.error('Raw response:', response.rawResponse);
        return {
          diffs: [],
          conversationId: `rewrite_${Date.now()}`,
          rewrittenText: request.text,
          changes: [],
          summary: '改写失败：JSON解析错误',
          explanation: response.rawResponse ? '模型返回了非JSON格式的响应' : '未知错误',
          suggestions: '请重试或检查网络连接',
          hasChanges: false
        } as any;
      }

      const rewrittenText = response.rewrittenText || request.text;

      // 构建详细的changes信息
      const changes = (response.changes || []).map((change: any) => ({
        type: change.type || 'content',
        description: change.description || '',
        originalText: change.originalText || '',
        rewrittenText: change.rewrittenText || '',
        reason: change.reason || ''
      }));

      return {
        diffs: this.calculateDiff(request.text, rewrittenText),
        conversationId: `rewrite_${Date.now()}`,
        // 添加额外信息用于UI显示
        rewrittenText: rewrittenText,
        changes: changes,
        summary: response.summary || `进行了 ${changes.length} 处改写`,
        explanation: response.explanation || '',
        suggestions: response.suggestions || '',
        hasChanges: rewrittenText !== request.text
      } as any;
    } catch (error) {
      console.error('Failed to parse rewrite response:', error);
      return {
        diffs: [],
        conversationId: `rewrite_${Date.now()}`,
        rewrittenText: request.text,
        changes: [],
        summary: '改写失败',
        explanation: '解析响应时发生错误',
        suggestions: '请重试',
        hasChanges: false
      } as any;
    }
  }

  /**
   * 从AI响应中提取JSON - 统一的解析方法
   */
  private extractJsonFromResponse(response: string): any {
    console.log('Extracting JSON from response:', response.substring(0, 200) + '...');

    // 多种清理和解析策略
    const parseStrategies = [
      // 策略1: 直接解析
      (text: string) => {
        return JSON.parse(text.trim());
      },

      // 策略2: 移除markdown代码块（改进版）
      (text: string) => {
        let clean = text.trim();
        // 处理转义的换行符
        clean = clean.replace(/\\n/g, '\n');
        // 移除markdown代码块标记
        clean = clean.replace(/^\n*```json\s*\n*/, '').replace(/\n*```\s*\n*$/, '');
        clean = clean.replace(/^\n*```\s*\n*/, '').replace(/\n*```\s*\n*$/, '');
        return JSON.parse(clean);
      },

      // 策略3: 正则提取JSON对象
      (text: string) => {
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('No JSON object found');
        let jsonStr = match[0];
        // 清理尾部的markdown标记
        jsonStr = jsonStr.replace(/\s*```[\s\S]*$/, '');
        return JSON.parse(jsonStr);
      },

      // 策略4: 查找第一个{到最后一个}
      (text: string) => {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace < 0 || lastBrace <= firstBrace) {
          throw new Error('No valid JSON boundaries found');
        }
        const jsonStr = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonStr);
      },

      // 策略5: 查找```json到```之间的内容（改进版）
      (text: string) => {
        // 处理换行符转义的情况
        const normalizedText = text.replace(/\\n/g, '\n');
        const jsonBlockMatch = normalizedText.match(/```json\s*([\s\S]*?)\s*```/);
        if (!jsonBlockMatch) throw new Error('No JSON code block found');
        return JSON.parse(jsonBlockMatch[1]);
      }
    ];

    // 依次尝试每种策略
    for (let i = 0; i < parseStrategies.length; i++) {
      try {
        const parsed = parseStrategies[i](response);
        console.log(`Successfully parsed JSON with strategy ${i + 1}:`, parsed);
        return parsed;
      } catch (error) {
        console.log(`Strategy ${i + 1} failed:`, error instanceof Error ? error.message : String(error));
      }
    }

    console.error('All JSON parsing strategies failed for response:', response);

    // 如果无法解析JSON，返回默认结构
    return {
      error: 'Failed to parse JSON response',
      rawResponse: response,
      // 根据响应内容猜测类型并返回合适的默认结构
      correctedText: response,
      polishedText: response,
      translatedText: response,
      rewrittenText: response,
      changes: [],
      issues: []
    };
  }

  /**
   * 计算文本差异 - 使用更精确的diff算法
   */
  private calculateDiff(originalText: string, modifiedText: string): any[] {
    if (originalText === modifiedText) {
      return [{ type: 'equal', value: originalText }];
    }

    // 使用简单的LCS算法来计算更精确的diff
    const originalWords = originalText.split(/(\s+)/);
    const modifiedWords = modifiedText.split(/(\s+)/);

    const diffs = this.computeWordDiff(originalWords, modifiedWords);
    return this.mergeDiffs(diffs);
  }

  /**
   * 计算单词级别的差异
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
   * 合并相邻的相同类型的diff
   */
  private mergeDiffs(diffs: any[]): any[] {
    if (diffs.length === 0) return diffs;

    const merged: any[] = [];
    let current = { ...diffs[0] };

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
