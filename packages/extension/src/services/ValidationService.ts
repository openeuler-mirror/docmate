import * as vscode from 'vscode';
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
    if (!llmResponse || !Array.isArray(llmResponse.suggestions)) {
      return [];
    }

    const chunkMap = new Map<string, TextChunk>();
    chunks.forEach(chunk => chunkMap.set(chunk.id, chunk));

    const diagnostics: DiagnosticInfo[] = [];

    for (let i = 0; i < llmResponse.suggestions.length; i++) {
      const suggestion = llmResponse.suggestions[i];

      try {
        if (!this.validateSuggestion(suggestion)) {
          continue;
        }

        const chunk = chunkMap.get(suggestion.chunk_id);
        if (!chunk) {
          continue;
        }

        if (!this.validateSuggestionInChunk(suggestion, chunk, llmResponse.suggestions, i)) {
          continue;
        }

        if (this.isTrivialSuggestion(suggestion)) {
          continue;
        }

        const diagnostic = this.createDiagnostic(suggestion, chunk, i);
        diagnostics.push(diagnostic);
      } catch (error) {
        console.error(`Error processing suggestion ${i + 1}:`, error);
      }
    }

    return diagnostics;
  }

  /**
   * 验证suggestion的基本结构
   */
  private static validateSuggestion(suggestion: Suggestion): boolean {
    const requiredFields = ['chunk_id', 'type', 'description', 'original_text', 'suggested_text', 'severity'];

    for (const field of requiredFields) {
      if (!(field in suggestion)) {
        return false;
      }
    }

    if (!suggestion.chunk_id || typeof suggestion.chunk_id !== 'string') {
      return false;
    }

    if (!suggestion.original_text || typeof suggestion.original_text !== 'string') {
      return false;
    }

    if (!suggestion.suggested_text || typeof suggestion.suggested_text !== 'string') {
      return false;
    }

    if (!['error', 'warning', 'info'].includes(suggestion.severity)) {
      return false;
    }

    if (suggestion.original_text.trim().length === 0) {
      return false;
    }

    if (suggestion.suggested_text.trim().length === 0) {
      return false;
    }

    if (suggestion.original_text === suggestion.suggested_text) {
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
    allSuggestions: Suggestion[] = [],
    currentIndex: number = 0
  ): boolean {
    const chunkText = chunk.core_text;
    const originalText = suggestion.original_text;

    const occurrences = this.countOccurrences(chunkText, originalText);
    if (occurrences > 0) {
      const expectedOccurrence = this.getExpectedOccurrenceIndex(allSuggestions, currentIndex, originalText);
      if (occurrences > expectedOccurrence) {
        return true;
      }
    }

    const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
    const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
    const normalizedOccurrences = this.countOccurrences(normalizedChunk, normalizedOriginal);
    if (normalizedOccurrences > 0) {
      return true;
    }

    if (originalText.match(/[a-zA-Z]/)) {
      const lowerChunk = chunkText.toLowerCase();
      const lowerOriginal = originalText.toLowerCase();
      if (lowerChunk.includes(lowerOriginal)) {
        return true;
      }
    }

    if (originalText.length > 15) {
      const coreText = originalText.substring(0, Math.min(originalText.length, 20));
      if (chunkText.includes(coreText)) {
        return true;
      }
    }

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
    let range;
    try {
      range = this.calculateSuggestionRange(suggestion, chunk, suggestionIndex);
    } catch (error) {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        range = new vscode.Range(
          chunk.range.start.line,
          0,
          Math.min(chunk.range.start.line + 1, activeEditor.document.lineCount - 1),
          0
        );
      } else {
        range = chunk.range;
      }
    }

    return {
      range,
      message: suggestion.description,
      severity: suggestion.severity,
      source: 'DocMate',
      code: suggestion.type,
      original_text: suggestion.original_text,
      suggested_text: suggestion.suggested_text,
      suggestion_type: suggestion.type
    };
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

    console.log('=== calculateSuggestionRange 调试信息 ===');
    console.log('suggestion:', suggestion);
    console.log('chunk.id:', chunk.id);
    console.log('chunk.range:', chunk.range);
    console.log('chunk.core_text长度:', chunk.core_text.length);
    console.log('chunk.core_text内容:', JSON.stringify(chunk.core_text.substring(0, 200)));

    // 精确计算suggestion在文档中的位置

    const searchText = suggestion.original_text;
    const chunkText = chunk.core_text;

    console.log('查找文本:', JSON.stringify(searchText));
    console.log('chunk总长度:', chunkText.length);

    // 直接查找original_text在chunk中的精确位置
    let searchIndex = chunkText.indexOf(searchText);

    console.log('第一次查找结果 (indexOf):', searchIndex);

    // 如果找不到，尝试规范化匹配（处理空格差异）
    if (searchIndex === -1) {
      console.log('未找到精确匹配，尝试规范化匹配...');
      const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
      const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();

      console.log('normalizedChunk:', JSON.stringify(normalizedChunk.substring(0, 100)));
      console.log('normalizedSearch:', JSON.stringify(normalizedSearch));

      if (normalizedChunk.includes(normalizedSearch)) {
        searchIndex = this.findBestMatchPosition(chunkText, searchText);
        console.log('最佳匹配位置:', searchIndex);
      }
    }

    if (searchIndex === -1) {
      console.error('无法找到文本:', JSON.stringify(searchText));
      console.error('chunk文本:', JSON.stringify(chunkText));
      throw new Error(`Cannot locate text "${searchText}" in chunk ${chunk.id}`);
    }

    // 计算精确的range
    const searchLength = searchText.length;

    console.log('最终使用:');
    console.log('- searchIndex:', searchIndex);
    console.log('- searchLength:', searchLength);
    console.log('- 找到的文本:', JSON.stringify(chunkText.substring(searchIndex, searchIndex + searchLength)));

    // 转换为文档位置
    const range = this.convertIndexToRange(chunkText, searchIndex, searchLength, chunk.range);

    console.log('最终计算的range:', range);
    console.log('=== calculateSuggestionRange 结束 ===');
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

    console.log('=== convertIndexToRange 调试信息 ===');
    console.log('输入参数:');
    console.log('- startIndex:', startIndex);
    console.log('- length:', length);
    console.log('- chunkRange:', chunkRange);
    console.log('- text长度:', text.length);
    console.log('- text内容:', text.substring(0, 100) + '...');

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

    console.log('计算结果:');
    console.log('- startLineOffset:', startLineOffset);
    console.log('- startCharOffset:', startCharOffset);
    console.log('- endLineOffset:', endLineOffset);
    console.log('- endCharOffset:', endCharOffset);

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

    console.log('最终位置:');
    console.log('- startLine:', startLine);
    console.log('- startCharacter:', startCharacter);
    console.log('- endLine:', endLine);
    console.log('- endCharacter:', endCharacter);

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
        return -1;
      }
    }

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