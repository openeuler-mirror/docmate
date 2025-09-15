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
   * 计算suggestion在文档中的精确位置（词级精度）- 修复重复文本定位问题
   */
  private static calculateSuggestionRange(
    suggestion: Suggestion,
    chunk: TextChunk,
    suggestionIndex: number = 0  // 新增：suggestion在列表中的索引，用于处理重复文本
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    console.log('\n=== calculateSuggestionRange Debug ===');
    const chunkText = chunk.core_text;
    const searchText = suggestion.original_text;

    console.log('Chunk text length:', chunkText.length);
    console.log('Chunk text:', JSON.stringify(chunkText));
    console.log('Search text length:', searchText.length);
    console.log('Search text:', JSON.stringify(searchText));

    // 查找搜索文本在chunk中的位置 - 修复重复文本定位
    let searchIndex = -1;

    // 尝试1: 精确匹配 - 支持第N次出现
    console.log('-> Trying exact match with occurrence support...');
    searchIndex = this.findNthOccurrence(chunkText, searchText, suggestionIndex);
    console.log(`-> Exact match result for occurrence ${suggestionIndex}:`, searchIndex);

    // 尝试2: 移除多余空格后匹配
    if (searchIndex === -1) {
      console.log('-> Trying normalized match...');
      const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
      const normalizedSearch = searchText.replace(/\s+/g, ' ').trim();
      console.log('-> Normalized chunk:', JSON.stringify(normalizedChunk));
      console.log('-> Normalized search:', JSON.stringify(normalizedSearch));
      searchIndex = normalizedChunk.indexOf(normalizedSearch);
      console.log('-> Normalized match result:', searchIndex);

      if (searchIndex !== -1) {
        console.log('-> Mapping normalized position back to original...');
        // 需要将规范化后的位置映射回原始文本
        searchIndex = this.mapNormalizedPosition(chunkText, searchIndex);
        console.log('-> Mapped position:', searchIndex);
      }
    }

    // 尝试3: 忽略大小写匹配（英文文本）
    if (searchIndex === -1 && searchText.match(/[a-zA-Z]/)) {
      console.log('-> Trying case-insensitive match...');
      searchIndex = chunkText.toLowerCase().indexOf(searchText.toLowerCase());
      console.log('-> Case-insensitive match result:', searchIndex);
    }

    // 尝试4: 部分匹配（取原文本的核心部分）
    if (searchIndex === -1 && searchText.length > 10) {
      console.log('-> Trying partial match...');
      const coreText = searchText.substring(0, Math.min(searchText.length, 30));
      console.log('-> Core text for partial match:', JSON.stringify(coreText));
      searchIndex = chunkText.indexOf(coreText);
      console.log('-> Partial match result:', searchIndex);

      if (searchIndex !== -1) {
        console.log(`Using partial match for: "${searchText}" in chunk ${chunk.id}`);
      }
    }

    // 尝试5: 单词级别模糊匹配
    if (searchIndex === -1) {
      console.log('-> Trying fuzzy match...');
      searchIndex = this.findFuzzyMatchPosition(chunkText, searchText);
      console.log('-> Fuzzy match result:', searchIndex);
    }

    // 如果所有方法都失败，记录详细错误
    if (searchIndex === -1) {
      console.error('-> ALL MATCHING METHODS FAILED');
      console.error('-> Search text:', JSON.stringify(searchText));
      console.error('-> Chunk text:', JSON.stringify(chunkText));
      console.error('-> Chunk text preview:', JSON.stringify(chunkText.substring(0, 100) + '...'));
      throw new Error(`Cannot locate text "${searchText}" in chunk ${chunk.id}`);
    }

    console.log('-> Successfully found text at index:', searchIndex);

    // 计算搜索文本的长度（考虑规范化）
    let searchLength = searchText.length;

    // 修复：检查length是否为0或无效
    if (searchLength <= 0) {
      console.warn(`Invalid search length: ${searchLength} for text: "${searchText}"`);
      throw new Error(`Invalid search length: ${searchLength}`);
    }

    if (searchIndex >= 0 && searchIndex + searchLength > chunkText.length) {
      searchLength = chunkText.length - searchIndex;
      if (searchLength <= 0) {
        console.warn(`Adjusted search length is invalid: ${searchLength}`);
        throw new Error(`Invalid adjusted search length: ${searchLength}`);
      }
    }

    // 精确计算在chunk中的相对位置
    const textBeforeMatch = chunkText.substring(0, searchIndex);
    const linesBeforeMatch = textBeforeMatch.split('\n');
    const lineOffset = linesBeforeMatch.length - 1;
    const characterOffset = linesBeforeMatch[linesBeforeMatch.length - 1].length;

    // 计算匹配文本的行跨度
    let matchedText = chunkText.substring(searchIndex, searchIndex + searchLength);
    let matchedLines = matchedText.split('\n');
    let lineSpan = matchedLines.length - 1;

    // 词级精度优化：如果匹配文本很长，尝试缩小到具体的问题词汇
    if (matchedText.length > 10 && suggestion.type !== 'FORMATTING') {
      const refinedRange = this.refineToWordLevel(matchedText, suggestion);
      if (refinedRange) {
        searchIndex += refinedRange.offset;
        searchLength = refinedRange.length;
        matchedText = refinedRange.text;
        matchedLines = matchedText.split('\n');
        lineSpan = matchedLines.length - 1;
      }
    }

    // 映射到文档中的绝对位置
    const startLine = chunk.range.start.line + lineOffset;
    const endLine = startLine + lineSpan;

    let startCharacter = 0;
    let endCharacter = 0;

    if (lineOffset === 0) {
      startCharacter = chunk.range.start.character + characterOffset;
    } else {
      startCharacter = characterOffset;
    }

    if (lineSpan === 0) {
      // 修复：确保matchedLines[0]存在且有长度，避免endCharacter为0
      const firstLineLength = matchedLines[0] ? matchedLines[0].length : 0;
      endCharacter = startCharacter + Math.max(firstLineLength, 1); // 确保至少长度为1
    } else {
      // 修复：确保matchedLines[matchedLines.length - 1]存在且有长度
      const lastLineLength = matchedLines[matchedLines.length - 1] ? matchedLines[matchedLines.length - 1].length : 0;
      endCharacter = Math.max(lastLineLength, 1); // 确保至少长度为1
    }

    // 验证计算的范围是否有效
    if (startLine < 0 || startCharacter < 0 || endLine < startLine || (endLine === startLine && endCharacter <= startCharacter)) {
      console.warn(`Invalid range calculated: start(${startLine}, ${startCharacter}), end(${endLine}, ${endCharacter})`);
      console.warn(`Chunk range:`, chunk.range);
      console.warn(`Search index: ${searchIndex}, length: ${searchLength}`);
      // 返回chunk的起始位置作为fallback
      return {
        start: { line: chunk.range.start.line, character: chunk.range.start.character },
        end: { line: chunk.range.start.line, character: chunk.range.start.character + 10 }
      };
    }

    console.log(`Range calculated for "${searchText}": start(${startLine}, ${startCharacter}), end(${endLine}, ${endCharacter})`);

    return {
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter }
    };
  }

  /**
   * 将匹配范围精确到词级 - 简化版本
   */
  private static refineToWordLevel(
    matchedText: string,
    suggestion: Suggestion
  ): { offset: number; length: number; text: string } | null {

    // 对于标点和空格问题，直接定位到问题字符
    if (suggestion.type === 'PUNCTUATION' || suggestion.type === 'SPACING') {
      return this.findPunctuationOrSpacingRange(matchedText);
    }

    // 对于术语问题，尝试精确匹配
    if (suggestion.type === 'TERMINOLOGY') {
      const termIndex = matchedText.indexOf(suggestion.original_text);
      if (termIndex !== -1) {
        return {
          offset: termIndex,
          length: suggestion.original_text.length,
          text: suggestion.original_text
        };
      }
    }

    // 对于错别字和其他问题，找到最小的有意义的词汇单元
    return this.findMinimalWordUnit(matchedText);
  }

  /**
   * 找到标点或空格问题的精确位置 - 简化版本
   */
  private static findPunctuationOrSpacingRange(
    text: string
  ): { offset: number; length: number; text: string } | null {

    // 查找中文标点符号
    const chinesePunctuationRegex = /[\u3000-\u303F\uFF00-\uFFEF]/g;
    const punctuationMatch = chinesePunctuationRegex.exec(text);
    if (punctuationMatch) {
      return {
        offset: punctuationMatch.index,
        length: punctuationMatch[0].length,
        text: punctuationMatch[0]
      };
    }

    // 查找连续的空格
    const multipleSpacesRegex = /\s{2,}/g;
    const spaceMatch = multipleSpacesRegex.exec(text);
    if (spaceMatch) {
      return {
        offset: spaceMatch.index,
        length: spaceMatch[0].length,
        text: spaceMatch[0]
      };
    }

    return null;
  }

  /**
   * 找到最小的有意义的词汇单元 - 简化版本
   */
  private static findMinimalWordUnit(
    text: string
  ): { offset: number; length: number; text: string } | null {

    // 如果文本很短（少于15个字符），直接返回
    if (text.length <= 15) {
      return {
        offset: 0,
        length: text.length,
        text: text
      };
    }

    // 尝试找到单个词汇（2-10个字符）
    const words = text.split(/\s+/);
    for (const word of words) {
      if (word.length >= 2 && word.length <= 10) {
        const offset = text.indexOf(word);
        return {
          offset,
          length: word.length,
          text: word
        };
      }
    }

    // 如果没有合适的词汇，返回前10个字符
    return {
      offset: 0,
      length: Math.min(10, text.length),
      text: text.substring(0, Math.min(10, text.length))
    };
  }

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

  /**
   * 查找最小的有意义的文本单元
   */
  private static findMinimalMeaningfulUnit(
    text: string
  ): { offset: number; length: number; text: string } | null {

    // 优先匹配单个词汇
    const words = text.split(/\s+/);
    if (words.length > 1) {
      // 返回第一个长度适中的词汇
      for (const word of words) {
        if (word.length >= 2 && word.length <= 10) {
          const offset = text.indexOf(word);
          return {
            offset,
            length: word.length,
            text: word
          };
        }
      }
    }

    // 如果没有合适的词汇，返回前10个字符
    if (text.length > 10) {
      return {
        offset: 0,
        length: 10,
        text: text.substring(0, 10)
      };
    }

    return null;
  }

  /**
   * 比较两个文本，找到差异部分
   */
  private static findTextDifference(
    text1: string,
    text2: string
  ): { offset: number; length: number; text: string } | null {

    const minLength = Math.min(text1.length, text2.length);
    let startDiff = 0;
    let endDiff = 0;

    // 找到开始差异的位置
    while (startDiff < minLength && text1[startDiff] === text2[startDiff]) {
      startDiff++;
    }

    // 找到结束差异的位置
    while (endDiff < minLength - startDiff &&
           text1[text1.length - 1 - endDiff] === text2[text2.length - 1 - endDiff]) {
      endDiff++;
    }

    const diffLength = text1.length - startDiff - endDiff;
    if (diffLength > 0) {
      return {
        offset: startDiff,
        length: diffLength,
        text: text1.substring(startDiff, startDiff + diffLength)
      };
    }

    return null;
  }

  /**
   * 查找模糊匹配位置
   */
  private static findFuzzyMatchPosition(chunkText: string, searchText: string): number {
    // 如果搜索文本太短，不进行模糊匹配
    if (searchText.length < 5) {
      return -1;
    }

    const chunkWords = chunkText.split(/\s+/);
    const searchWords = searchText.split(/\s+/);

    // 如果搜索文本只有一个词，直接查找包含这个词的位置
    if (searchWords.length === 1) {
      const word = searchWords[0];
      if (word.length >= 3) {
        for (let i = 0; i < chunkWords.length; i++) {
          if (chunkWords[i].includes(word) || word.includes(chunkWords[i])) {
            // 计算这个词在原始文本中的位置
            let position = 0;
            for (let j = 0; j < i; j++) {
              position += chunkWords[j].length + 1; // +1 for space
            }
            return position;
          }
        }
      }
      return -1;
    }

    // 多词匹配：寻找连续的词序列
    let bestMatchIndex = -1;
    let bestMatchScore = 0;

    for (let i = 0; i <= chunkWords.length - searchWords.length; i++) {
      let matchScore = 0;
      for (let j = 0; j < searchWords.length; j++) {
        const chunkWord = chunkWords[i + j];
        const searchWord = searchWords[j];

        if (chunkWord === searchWord) {
          matchScore += 3; // 完全匹配得分最高
        } else if (chunkWord.includes(searchWord) || searchWord.includes(chunkWord)) {
          matchScore += 2; // 包含匹配
        } else if (chunkWord.toLowerCase() === searchWord.toLowerCase()) {
          matchScore += 2; // 大小写不敏感匹配
        } else if (chunkWord.toLowerCase().includes(searchWord.toLowerCase()) ||
                   searchWord.toLowerCase().includes(chunkWord.toLowerCase())) {
          matchScore += 1; // 包含且大小写不敏感匹配
        }
      }

      if (matchScore > bestMatchScore && matchScore >= searchWords.length * 1.5) {
        bestMatchScore = matchScore;
        // 计算匹配起始位置
        let position = 0;
        for (let j = 0; j < i; j++) {
          position += chunkWords[j].length + 1;
        }
        bestMatchIndex = position;
      }
    }

    if (bestMatchIndex !== -1) {
      console.log(`Fuzzy match found for "${searchText}" with score ${bestMatchScore}`);
    }

    return bestMatchIndex;
  }

  /**
   * 将规范化后的位置映射回原始文本位置
   */
  private static mapNormalizedPosition(originalText: string, normalizedIndex: number): number {
    let originalIndex = 0;
    let normalizedIndexCounter = 0;

    while (originalIndex < originalText.length && normalizedIndexCounter < normalizedIndex) {
      const char = originalText[originalIndex];

      if (char === ' ' || char === '\t' || char === '\n') {
        // 跳过空白字符，规范化时这些都被替换为单个空格
        normalizedIndexCounter += 0; // 空白字符在规范化时被压缩
      } else {
        normalizedIndexCounter++;
      }

      originalIndex++;
    }

    return originalIndex;
  }

  /**
   * 计算智能回退位置 - 当精确位置计算失败时的智能回退策略
   */
  private static calculateFallbackRange(
    suggestion: Suggestion,
    chunk: TextChunk,
    suggestionIndex: number = 0
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    console.log(`-> calculateFallbackRange for suggestion "${suggestion.original_text}" in chunk ${chunk.id}`);

    // 根据suggestion类型采用不同的回退策略
    switch (suggestion.type) {
      case 'PUNCTUATION':
      case 'SPACING':
        // 标点和空格问题：在chunk中查找相似的标点符号
        return this.findPunctuationFallbackRange(chunk.core_text, chunk.range, suggestion);

      case 'TERMINOLOGY':
        // 术语问题：查找术语出现的所有可能位置
        return this.findTerminologyFallbackRange(chunk.core_text, chunk.range, suggestion, suggestionIndex);

      case 'TYPO':
        // 错别字问题：基于文本长度估算位置
        return this.findTypoFallbackRange(chunk.core_text, chunk.range, suggestion, suggestionIndex);

      default:
        // 通用回退策略：按suggestion索引均匀分布
        return this.generateDistributedFallbackRange(chunk.core_text, chunk.range, suggestionIndex);
    }
  }

  /**
   * 标点符号回退策略
   */
  private static findPunctuationFallbackRange(
    chunkText: string,
    chunkRange: any,
    suggestion: Suggestion
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 查找中文标点符号
    const punctuationRegex = /[\u3000-\u303F\uFF00-\uFFEF]/g;
    const matches = Array.from(chunkText.matchAll(punctuationRegex));

    if (matches.length > 0) {
      const match = matches[0]; // 使用第一个匹配的标点
      const relativePos = match.index!;
      return this.convertRelativePositionToAbsolute(chunkText, chunkRange, relativePos, 1);
    }

    // 如果没找到标点，返回chunk开始位置
    return {
      start: { line: chunkRange.start.line, character: chunkRange.start.character },
      end: { line: chunkRange.start.line, character: chunkRange.start.character + 1 }
    };
  }

  /**
   * 术语回退策略
   */
  private static findTerminologyFallbackRange(
    chunkText: string,
    chunkRange: any,
    suggestion: Suggestion,
    suggestionIndex: number
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 尝试找到suggestion中的关键词
    const keywords = suggestion.original_text.split(/\s+/).filter(word => word.length > 1);

    for (const keyword of keywords) {
      const occurrences = this.countOccurrences(chunkText, keyword);
      if (occurrences > suggestionIndex) {
        const position = this.findNthOccurrence(chunkText, keyword, suggestionIndex);
        if (position !== -1) {
          return this.convertRelativePositionToAbsolute(chunkText, chunkRange, position, keyword.length);
        }
      }
    }

    // 回退到分布式定位
    return this.generateDistributedFallbackRange(chunkText, chunkRange, suggestionIndex);
  }

  /**
   * 错别字回退策略
   */
  private static findTypoFallbackRange(
    chunkText: string,
    chunkRange: any,
    suggestion: Suggestion,
    suggestionIndex: number
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 对于错别字，基于文本长度按比例分布
    const totalLength = chunkText.length;
    const segmentSize = Math.max(10, Math.floor(totalLength / Math.max(1, suggestionIndex + 1)));
    const position = Math.min(suggestionIndex * segmentSize, totalLength - suggestion.original_text.length);

    return this.convertRelativePositionToAbsolute(chunkText, chunkRange, position, suggestion.original_text.length);
  }

  /**
   * 通用分布式回退策略
   */
  private static generateDistributedFallbackRange(
    chunkText: string,
    chunkRange: any,
    suggestionIndex: number
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    // 将chunk分成若干段，每段放置一个suggestion
    const totalLength = chunkText.length;
    const estimatedSuggestionCount = suggestionIndex + 1;
    const segmentSize = Math.max(20, Math.floor(totalLength / estimatedSuggestionCount));
    const position = Math.min(suggestionIndex * segmentSize, totalLength - 1);

    return this.convertRelativePositionToAbsolute(chunkText, chunkRange, position, Math.min(10, totalLength - position));
  }

  /**
   * 将相对位置转换为绝对位置
   */
  private static convertRelativePositionToAbsolute(
    chunkText: string,
    chunkRange: any,
    relativePos: number,
    length: number
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    const textBeforeMatch = chunkText.substring(0, relativePos);
    const linesBeforeMatch = textBeforeMatch.split('\n');
    const lineOffset = linesBeforeMatch.length - 1;
    const characterOffset = linesBeforeMatch[linesBeforeMatch.length - 1].length;

    const startLine = chunkRange.start.line + lineOffset;
    const endLine = startLine;

    let startCharacter = 0;
    if (lineOffset === 0) {
      startCharacter = chunkRange.start.character + characterOffset;
    } else {
      startCharacter = characterOffset;
    }

    const endCharacter = startCharacter + length;

    return {
      start: { line: startLine, character: startCharacter },
      end: { line: endLine, character: endCharacter }
    };
  }

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