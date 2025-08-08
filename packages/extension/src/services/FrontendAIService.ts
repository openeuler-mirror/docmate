import {
  AIResult,
  ChatMessage,
  createError,
  Diff,
  Issue
} from '@docmate/shared';
import {
  buildCheckPrompt,
  buildPolishPrompt,
  buildTranslatePrompt,
  buildRewritePrompt
} from '../prompts';
import { TerminologyService } from '@docmate/utils';

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
  private terminologyService: TerminologyService;

  constructor(config: FrontendAIConfig) {
    this.config = {
      timeout: 30000,
      maxRetries: 3,
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
   * 检查文本
   */
  async check(text: string, options: any = {}): Promise<AIResult> {
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
      const aiResponse = await this.callAIService(prompt, [], this.getCheckToolOptions());
      // 如果返回为 {tool,args}，直接传递即可；parse 支持对象
      return this.parseAIResponse(aiResponse, 'check', text);
    } catch (error) {
      console.error('FrontendAIService: Check failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      console.error('FrontendAIService: Polish failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text polish failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      console.error('FrontendAIService: Translate failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      console.error('FrontendAIService: Rewrite failed:', error);
      throw createError('AI_SERVICE_ERROR', `Text rewrite failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 调用AI服务的核心方法
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
    const requestBody: any = {
      model: this.config.model,
      messages: messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: 2000,
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
          const choice = data.choices?.[0];
          const toolCalls = choice?.message?.tool_calls;
          if (toolCalls && toolCalls.length > 0) {
            const first = toolCalls[0];
            const argsStr = first?.function?.arguments || '{}';
            try {
              const args = JSON.parse(argsStr);
              return { tool: first.function?.name, args };
            } catch (e) {
              throw new Error('Tool calling arguments JSON 解析失败');
            }
          }

          const content = choice?.message?.content;

          // 如果没有content但有tool calls，说明AI使用了工具调用
          if (!content && (!toolCalls || toolCalls.length === 0)) {
            console.error('FrontendAIService: No content or tool calls in response', {
              choice,
              data
            });
            throw new Error('Invalid response format from AI service: no content or tool calls');
          }

          console.log('FrontendAIService: AI call successful', {
            attempt: attempt + 1,
            responseLength: content?.length || 0,
            hasToolCalls: toolCalls?.length > 0
          });

          return content || '';
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
          issues = (response.issues || []).map((issue: any) => ({
            type: issue.type || 'grammar',
            severity: issue.severity || 'info',
            message: issue.message || '',
            suggestion: issue.suggestion || '',
            range: [issue.start || 0, issue.end || 0] as [number, number]
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
      return {
        type,
        originalText,
        modifiedText: originalText,
        diffs: [],
        summary: `解析AI响应失败`,
        explanation: `无法从AI响应中解析出有效的结果。原始响应: \n${aiResponse}`
      };
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
      return text.trim();
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

    // 先按行级进行 LCS 对齐，再对变更的行做词级 diff，提高可读性
    const originalLines = originalText.split(/\r?\n/);
    const modifiedLines = modifiedText.split(/\r?\n/);
    const lineDiffs = this.computeLineDiff(originalLines, modifiedLines);

    // 将行级 diff 中的 equal 直接返回，将 insert/delete 的行再拆成词级 diff
    const result: Diff[] = [];
    for (const ld of lineDiffs) {
      if (ld.type === 'equal') {
        result.push({ type: 'equal', value: ld.value + '\n' });
      } else if (ld.type === 'delete') {
        // 对删除的行直接标记整行删除并保留换行
        result.push({ type: 'delete', value: ld.value + '\n' });
      } else if (ld.type === 'insert') {
        result.push({ type: 'insert', value: ld.value + '\n' });
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
        result.push({ type: 'equal', value: '\n' });
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
                      type: { type: 'string', enum: ['grammar','terminology','style','consistency'] },
                      severity: { type: 'string', enum: ['error','warning','info'] },
                      message: { type: 'string', description: '简要标题（简短）' },
                      suggestion: { type: 'string', description: '详细说明与建议（可多行）' },
                      start: { type: 'number' },
                      end: { type: 'number' },
                      originalText: { type: 'string' },
                      suggestedText: { type: 'string' },
                      confidence: { type: 'number' }
                    },
                    required: ['type','severity','message','suggestion','start','end']
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

}
