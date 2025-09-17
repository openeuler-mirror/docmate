import {
  TextChunk,
  Suggestion,
  CheckResultPayload,
  DiagnosticInfo
} from '@docmate/shared';
import { ErrorHandlingService } from './ErrorHandlingService';
import { ErrorCode } from '@docmate/shared';

/**
 * 验证和映射服务
 * 负责验证LLM返回的suggestion并映射到DiagnosticInfo
 */
export class ValidationService {

  /**
   * 验证并映射LLM响应到诊断信息 - 增强调试版本
   * @param chunks 原始文本块数组
   * @param llmResponse LLM返回的响应
   * @returns DiagnosticInfo[] 有效的诊断信息数组
   */
  public static validateAndMap(
    chunks: TextChunk[],
    llmResponse: CheckResultPayload
  ): DiagnosticInfo[] {

    console.log('\n=== ValidationService 增强调试信息 ===');
    console.log('输入chunks数量:', chunks.length);
    console.log('LLM返回suggestions数量:', llmResponse?.suggestions?.length || 0);

    // 新增：详细分析suggestions分布
    this.analyzeSuggestionsDistribution(chunks, llmResponse?.suggestions || []);
    console.log('--- 开始验证和映射处理 ---');

    if (!llmResponse || !Array.isArray(llmResponse.suggestions)) {
      console.warn('Invalid LLM response format');
      return [];
    }

    // 建立chunk索引映射
    const chunkMap = new Map<string, TextChunk>();
    chunks.forEach(chunk => {
      chunkMap.set(chunk.id, chunk);
    });
    console.log('Chunk map created with keys:', Array.from(chunkMap.keys()));

    const diagnostics: DiagnosticInfo[] = [];
    let invalidSuggestions = 0;

    for (let i = 0; i < llmResponse.suggestions.length; i++) {
      const suggestion = llmResponse.suggestions[i];
      console.log(`\n--- Processing Suggestion ${i + 1}/${llmResponse.suggestions.length} ---`);
      console.log('Suggestion details:', {
        chunk_id: suggestion.chunk_id,
        type: suggestion.type,
        description: suggestion.description,
        original_text: JSON.stringify(suggestion.original_text),
        suggested_text: JSON.stringify(suggestion.suggested_text),
        severity: suggestion.severity
      });

      try {
        // 验证suggestion的必需字段
        if (!this.validateSuggestion(suggestion)) {
          console.log(`-> Suggestion ${i + 1} FAILED validation`);
          invalidSuggestions++;
          continue;
        }

        // 查找对应的chunk
        const chunk = chunkMap.get(suggestion.chunk_id);
        if (!chunk) {
          console.log(`-> Chunk not found for id: ${suggestion.chunk_id}`);
          invalidSuggestions++;
          continue;
        }

        console.log(`-> Found matching chunk: ${chunk.id}`);
        console.log('-> Chunk content:', JSON.stringify(chunk.core_text));

        // 验证suggestion内容是否在chunk中存在 - 传入上下文信息
        if (!this.validateSuggestionInChunk(suggestion, chunk, llmResponse.suggestions, i)) {
          console.log(`-> Suggestion content not found in chunk: ${suggestion.chunk_id}`);
          invalidSuggestions++;
          continue;
        }

        console.log(`-> Suggestion content validated in chunk`);

        // 额外过滤：排除无意义的修改建议
        if (this.isTrivialSuggestion(suggestion)) {
          console.log(`-> Trivial suggestion filtered out: ${suggestion.description}`);
          invalidSuggestions++;
          continue;
        }

        console.log(`-> Suggestion passed all validations`);

        // 创建诊断信息 - 传入suggestion索引以支持重复文本定位
        const diagnostic = this.createDiagnostic(suggestion, chunk, i);  // 传入索引i
        console.log(`-> Created diagnostic:`, {
          message: diagnostic.message,
          range: diagnostic.range,
          severity: diagnostic.severity
        });
        diagnostics.push(diagnostic);

      } catch (error) {
        console.error(`Error processing suggestion ${i + 1}:`, error);
        invalidSuggestions++;
      }
    }

    // 记录统计信息
    console.log('\n=== Validation Summary ===');
    console.log(`Total suggestions processed: ${llmResponse.suggestions.length}`);
    console.log(`Valid diagnostics: ${diagnostics.length}`);
    console.log(`Invalid suggestions: ${invalidSuggestions}`);

    // 验证chunk_id分布
    const chunkIdCounts = new Map<string, number>();
    llmResponse.suggestions.forEach(suggestion => {
      const chunkId = suggestion.chunk_id || 'empty';
      const count = chunkIdCounts.get(chunkId) || 0;
      chunkIdCounts.set(chunkId, count + 1);
    });

    console.log('Chunk ID distribution:');
    chunkIdCounts.forEach((count, chunkId) => {
      console.log(`  ${chunkId}: ${count} suggestions`);
    });

    return diagnostics;
  }

  /**
   * 验证suggestion的基本结构
   */
  private static validateSuggestion(suggestion: Suggestion): boolean {
    const requiredFields = ['chunk_id', 'type', 'description', 'original_text', 'suggested_text', 'severity'];

    for (const field of requiredFields) {
      if (!(field in suggestion)) {
        console.warn(`Missing required field: ${field}`);
        return false;
      }
    }

    // 验证字段内容
    if (!suggestion.chunk_id || typeof suggestion.chunk_id !== 'string') {
      console.warn('Invalid chunk_id');
      return false;
    }

    if (!suggestion.original_text || typeof suggestion.original_text !== 'string') {
      console.warn('Invalid original_text');
      return false;
    }

    if (!suggestion.suggested_text || typeof suggestion.suggested_text !== 'string') {
      console.warn('Invalid suggested_text');
      return false;
    }

    if (!['error', 'warning', 'info'].includes(suggestion.severity)) {
      console.warn('Invalid severity');
      return false;
    }

    // 新增：检查original_text是否为空或长度为0
    if (suggestion.original_text.trim().length === 0) {
      console.warn(`Empty original_text: "${suggestion.original_text}"`);
      return false;
    }

    // 新增：检查suggested_text是否为空或长度为0
    if (suggestion.suggested_text.trim().length === 0) {
      console.warn(`Empty suggested_text: "${suggestion.suggested_text}"`);
      return false;
    }

    // 新增：检查original_text和suggested_text是否完全相同（无意义修改）
    if (suggestion.original_text === suggestion.suggested_text) {
      console.warn(`Identical original_text and suggested_text: "${suggestion.original_text}"`);
      return false;
    }

    return true;
  }

  /**
   * 验证suggestion的内容是否在chunk中存在 - 增强版本支持重复文本处理
   */
  private static validateSuggestionInChunk(
    suggestion: Suggestion,
    chunk: TextChunk,
    allSuggestions: Suggestion[] = [],  // 新增：所有suggestion用于上下文分析
    currentIndex: number = 0          // 新增：当前suggestion的索引
  ): boolean {
    const chunkText = chunk.core_text;
    const originalText = suggestion.original_text;

    console.log(`-> validateSuggestionInChunk: 验证 "${originalText}" 在 chunk ${chunk.id} (索引: ${currentIndex})`);

    // 1. 精确匹配 + 重复文本处理
    const occurrences = this.countOccurrences(chunkText, originalText);
    if (occurrences > 0) {
      // 检查当前suggestion是否有足够的出现次数
      const expectedOccurrence = this.getExpectedOccurrenceIndex(allSuggestions, currentIndex, originalText);
      if (occurrences > expectedOccurrence) {
        console.log(`-> validateSuggestionInChunk: 找到 ${occurrences} 次 "${originalText}", 需要第 ${expectedOccurrence + 1} 次`);
        return true;
      } else {
        console.log(`-> validateSuggestionInChunk: 只找到 ${occurrences} 次 "${originalText}", 但需要第 ${expectedOccurrence + 1} 次`);
      }
    }

    // 2. 标准化匹配（处理多余空格）
    const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
    const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
    const normalizedOccurrences = this.countOccurrences(normalizedChunk, normalizedOriginal);
    if (normalizedOccurrences > 0) {
      console.log(`-> validateSuggestionInChunk: 标准化匹配成功`);
      return true;
    }

    // 3. 大小写不敏感匹配（仅英文内容）
    if (originalText.match(/[a-zA-Z]/)) {
      const lowerChunk = chunkText.toLowerCase();
      const lowerOriginal = originalText.toLowerCase();
      if (lowerChunk.includes(lowerOriginal)) {
        console.log(`-> validateSuggestionInChunk: 大小写不敏感匹配成功`);
        return true;
      }
    }

    // 4. 对于较长的文本（>15字符），尝试核心部分匹配
    if (originalText.length > 15) {
      const coreText = originalText.substring(0, Math.min(originalText.length, 20));
      if (chunkText.includes(coreText)) {
        console.log(`-> validateSuggestionInChunk: 核心部分匹配成功`);
        return true;
      }
    }

    console.log(`-> validateSuggestionInChunk: 所有匹配方法都失败`);
    return false;
  }

  /**
   * 获取当前suggestion预期的出现索引
   */
  private static getExpectedOccurrenceIndex(
    allSuggestions: Suggestion[],
    currentIndex: number,
    targetText: string
  ): number {
    let occurrenceIndex = 0;
    for (let i = 0; i < currentIndex; i++) {
      if (allSuggestions[i].original_text === targetText) {
        occurrenceIndex++;
      }
    }
    return occurrenceIndex;
  }

  /**
   * 创建诊断信息 - 增强版本支持重复文本定位
   */
  private static createDiagnostic(suggestion: Suggestion, chunk: TextChunk, suggestionIndex: number = 0): DiagnosticInfo {
    console.log(`\n=== Creating Diagnostic for Suggestion ===`);
    console.log('Suggestion:', {
      type: suggestion.type,
      description: suggestion.description,
      original_text: JSON.stringify(suggestion.original_text),
      suggested_text: JSON.stringify(suggestion.suggested_text)
    });
    console.log('Chunk:', {
      id: chunk.id,
      core_text: JSON.stringify(chunk.core_text),
      range: chunk.range
    });

    // 计算suggestion在chunk中的精确位置 - 传入suggestion索引支持重复文本
    let range;
    try {
      console.log('-> Calculating precise range...');
      range = this.calculateSuggestionRange(suggestion, chunk, suggestionIndex);  // 传入索引
      console.log('-> Range calculated successfully:', range);
    } catch (error) {
      console.warn(`-> Failed to calculate range for suggestion in chunk ${chunk.id}:`, error);
      // 使用智能回退策略而不是简单的chunk起始位置
      range = this.calculateFallbackRange(suggestion, chunk, suggestionIndex);
      console.log(`-> Using fallback range for chunk ${chunk.id}:`, range);
    }

    const diagnostic = {
      range,
      message: suggestion.description,
      severity: suggestion.severity,
      source: 'DocMate',
      code: suggestion.type,
      original_text: suggestion.original_text,
      suggested_text: suggestion.suggested_text,
      suggestion_type: suggestion.type
    };

    console.log('-> Created diagnostic:', diagnostic);
    return diagnostic;
  }

  /**
   * 计算suggestion在文档中的精确位置 - 重构为真正的精准定位
   * 核心思路：既然LLM已经提供了original_text，我们就应该精确找到它的位置
   */
  private static calculateSuggestionRange(
    suggestion: Suggestion,
    chunk: TextChunk,
    suggestionIndex: number = 0
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 精确计算suggestion在文档中的位置

    const searchText = suggestion.original_text;
    const chunkText = chunk.core_text;

    // 直接查找original_text在chunk中的精确位置
    let searchIndex = chunkText.indexOf(searchText);

    // 如果找不到，尝试规范化匹配（处理空格差异）
    if (searchIndex === -1) {
      const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
      const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();

      if (normalizedChunk.includes(normalizedSearch)) {
        searchIndex = this.findBestMatchPosition(chunkText, searchText);
      }
    }

    if (searchIndex === -1) {
      throw new Error(`Cannot locate text "${searchText}" in chunk ${chunk.id}`);
    }

    // 计算精确的range
    const searchLength = searchText.length;

    // 转换为文档位置
    const range = this.convertIndexToRange(chunkText, searchIndex, searchLength, chunk.range);

    console.log('-> Final precise range:', range);

    return range;
  }

  /**
   * 将文本索引转换为VS Code Range
   */
  private static convertIndexToRange(
    text: string,
    startIndex: number,
    length: number,
    chunkRange: any
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 计算开始位置
    const textBeforeStart = text.substring(0, startIndex);
    const startLines = textBeforeStart.split('\n');
    const startLineOffset = startLines.length - 1;
    const startCharOffset = startLines[startLines.length - 1].length;

    // 计算结束位置
    const endIndex = startIndex + length;
    const textBeforeEnd = text.substring(0, endIndex);
    const endLines = textBeforeEnd.split('\n');
    const endLineOffset = endLines.length - 1;
    const endCharOffset = endLines[endLines.length - 1].length;

    // 映射到文档绝对位置
    const startLine = chunkRange.start.line + startLineOffset;
    const endLine = chunkRange.start.line + endLineOffset;

    let startCharacter = 0;
    let endCharacter = 0;

    if (startLineOffset === 0) {
      startCharacter = chunkRange.start.character + startCharOffset;
    } else {
      startCharacter = startCharOffset;
    }

    if (endLineOffset === 0) {
      endCharacter = chunkRange.start.character + endCharOffset;
    } else {
      endCharacter = endCharOffset;
    }

    return {
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter }
    };
  }

  /**
   * 找到最佳匹配位置 - 简化的文本匹配
   */
  private static findBestMatchPosition(chunkText: string, searchText: string): number {
    // 如果原始文本很短，直接搜索
    if (searchText.length <= 20) {
      return chunkText.indexOf(searchText);
    }

    // 对于长文本，寻找最相似的子串
    const searchWords = searchText.split(/\s+/).filter(word => word.length > 1);
    if (searchWords.length === 0) return -1;

    // 寻找第一个关键词
    const firstWord = searchWords[0];
    const firstIndex = chunkText.indexOf(firstWord);

    if (firstIndex !== -1) {
      // 验证周围文本是否匹配
      const contextStart = Math.max(0, firstIndex - 10);
      const contextEnd = Math.min(chunkText.length, firstIndex + searchText.length + 10);
      const context = chunkText.substring(contextStart, contextEnd);

      if (context.includes(searchText.substring(0, Math.min(searchText.length, 30)))) {
        return firstIndex;
      }
    }

    return -1;
  }

  /**
   * 将匹配范围精确到词级 - 大幅简化版本
   * 对于大多数情况，直接使用original_text的完整范围
   */
  private static refineToWordLevel(
    matchedText: string,
    suggestion: Suggestion
  ): { offset: number; length: number; text: string } | null {

    // 关键洞察：LLM提供的original_text通常已经是精确的问题文本
    // 我们不需要进一步优化范围，直接使用完整范围即可

    // 只有对于特别长的文本，才考虑缩小范围
    if (matchedText.length > 50) {
      // 对于长文本，尝试找到最相关的核心部分
      const searchText = suggestion.original_text;
      const coreIndex = matchedText.indexOf(searchText);

      if (coreIndex !== -1 && searchText.length < matchedText.length) {
        return {
          offset: coreIndex,
          length: searchText.length,
          text: searchText
        };
      }
    }

    // 默认情况下，使用完整范围
    return {
      offset: 0,
      length: matchedText.length,
      text: matchedText
    };
  }

  // findPunctuationOrSpacingRange 和 findMinimalWordUnit 方法已移除
// 新的简化策略直接使用LLM提供的original_text作为替换范围

  /**
   * 查找文本中第N次出现的位置 - 支持重复文本定位
   */
  private static findNthOccurrence(
    text: string,
    search: string,
    n: number
  ): number {
    if (!search || search.length === 0) return -1;

    let index = -1;
    for (let i = 0; i <= n; i++) {
      index = text.indexOf(search, index + 1);
      if (index === -1) {
        console.log(`-> findNthOccurrence: Only found ${i} occurrences of "${search}", requested ${n + 1}`);
        return -1;
      }
    }

    console.log(`-> findNthOccurrence: Found occurrence ${n + 1} of "${search}" at index ${index}`);
    return index;
  }

  // 已移除复杂的模糊匹配和回退方法，改用简洁的直接定位策略

  /**
   * 统计文本中子串出现的次数
   */
  private static countOccurrences(text: string, search: string): number {
    if (!search || search.length === 0) return 0;

    let count = 0;
    let index = 0;
    while ((index = text.indexOf(search, index)) !== -1) {
      count++;
      index += search.length;
    }
    return count;
  }

  /**
   * 检查是否为无意义的建议 - 简化版本
   */
  private static isTrivialSuggestion(suggestion: Suggestion): boolean {
    const original = suggestion.original_text.trim();
    const suggested = suggestion.suggested_text.trim();

    // 1. 如果建议文本和原文本相同，是无意义的
    if (original === suggested) {
      return true;
    }

    // 2. 如果只是大小写差异且不是术语问题，通常是无意义的
    if (original.toLowerCase() === suggested.toLowerCase() &&
        suggestion.type !== 'TERMINOLOGY') {
      return true;
    }

    // 3. 对于非标点空格问题，如果修改内容太短（少于2个字符），可能是无意义的
    if (original.length < 2 && suggested.length < 2 &&
        suggestion.type !== 'SPACING' &&
        suggestion.type !== 'PUNCTUATION') {
      return true;
    }

    return false;
  }

  /**
   * 分析suggestions分布情况 - 增强调试能力
   */
  private static analyzeSuggestionsDistribution(chunks: TextChunk[], suggestions: Suggestion[]): void {
    console.log('\n--- Suggestions Distribution Analysis ---');

    // 按chunk_id分组
    const suggestionsByChunk = new Map<string, Suggestion[]>();
    suggestions.forEach(suggestion => {
      const chunkId = suggestion.chunk_id || 'unknown';
      if (!suggestionsByChunk.has(chunkId)) {
        suggestionsByChunk.set(chunkId, []);
      }
      suggestionsByChunk.get(chunkId)!.push(suggestion);
    });

    console.log('按chunk分组的suggestions:');
    suggestionsByChunk.forEach((suggestions, chunkId) => {
      console.log(`  Chunk ${chunkId}: ${suggestions.length} suggestions`);
      suggestions.forEach((s, index) => {
        console.log(`    [${index}] Type: ${s.type}, Text: "${s.original_text}" -> "${s.suggested_text}"`);
      });
    });

    // 分析重复内容
    const contentMap = new Map<string, number>();
    suggestions.forEach(suggestion => {
      const content = suggestion.original_text;
      contentMap.set(content, (contentMap.get(content) || 0) + 1);
    });

    console.log('重复内容分析:');
    contentMap.forEach((count, content) => {
      if (count > 1) {
        console.log(`  "${content}" 出现 ${count} 次`);
      }
    });

    // 按类型统计
    const typeStats = new Map<string, number>();
    suggestions.forEach(suggestion => {
      const type = suggestion.type;
      typeStats.set(type, (typeStats.get(type) || 0) + 1);
    });

    console.log('按类型统计:');
    typeStats.forEach((count, type) => {
      console.log(`  ${type}: ${count} 个`);
    });
  }

  /**
   * 提取验证统计信息
   */
  public static getValidationStats(
    chunks: TextChunk[],
    llmResponse: CheckResultPayload
  ): {
    totalSuggestions: number;
    validSuggestions: number;
    invalidSuggestions: number;
    chunksProcessed: number;
    validationRate: number;
  } {

    if (!llmResponse || !Array.isArray(llmResponse.suggestions)) {
      return {
        totalSuggestions: 0,
        validSuggestions: 0,
        invalidSuggestions: 0,
        chunksProcessed: chunks.length,
        validationRate: 0
      };
    }

    const totalSuggestions = llmResponse.suggestions.length;
    const diagnostics = this.validateAndMap(chunks, llmResponse);
    const validSuggestions = diagnostics.length;
    const invalidSuggestions = totalSuggestions - validSuggestions;
    const validationRate = totalSuggestions > 0 ? (validSuggestions / totalSuggestions) * 100 : 0;

    return {
      totalSuggestions,
      validSuggestions,
      invalidSuggestions,
      chunksProcessed: chunks.length,
      validationRate: Math.round(validationRate * 100) / 100
    };
  }
}