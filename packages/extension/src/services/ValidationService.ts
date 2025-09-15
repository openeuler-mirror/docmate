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
   * 验证并映射LLM响应到诊断信息
   * @param chunks 原始文本块数组
   * @param llmResponse LLM返回的响应
   * @returns DiagnosticInfo[] 有效的诊断信息数组
   */
  public static validateAndMap(
    chunks: TextChunk[],
    llmResponse: CheckResultPayload
  ): DiagnosticInfo[] {

    console.log('\n=== ValidationService Debug Info ===');
    console.log('Input chunks count:', chunks.length);
    console.log('LLM response suggestions count:', llmResponse?.suggestions?.length || 0);

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

        // 验证suggestion内容是否在chunk中存在
        if (!this.validateSuggestionInChunk(suggestion, chunk)) {
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

        // 创建诊断信息
        const diagnostic = this.createDiagnostic(suggestion, chunk);
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

    return true;
  }

  /**
   * 验证suggestion的内容是否在chunk中存在 - 简化版本
   */
  private static validateSuggestionInChunk(suggestion: Suggestion, chunk: TextChunk): boolean {
    const chunkText = chunk.core_text;
    const originalText = suggestion.original_text;

    // 1. 精确匹配
    if (chunkText.includes(originalText)) {
      return true;
    }

    // 2. 标准化匹配（处理多余空格）
    const normalizedChunk = chunkText.replace(/\s+/g, ' ').trim();
    const normalizedOriginal = originalText.replace(/\s+/g, ' ').trim();
    if (normalizedChunk.includes(normalizedOriginal)) {
      return true;
    }

    // 3. 大小写不敏感匹配（仅英文内容）
    if (originalText.match(/[a-zA-Z]/) &&
        chunkText.toLowerCase().includes(originalText.toLowerCase())) {
      return true;
    }

    // 4. 对于较长的文本（>15字符），尝试核心部分匹配
    if (originalText.length > 15) {
      const coreText = originalText.substring(0, Math.min(originalText.length, 20));
      if (chunkText.includes(coreText)) {
        console.log(`Partial match found for: "${originalText}" in chunk ${chunk.id}`);
        return true;
      }
    }

    console.log(`No match found for: "${originalText}" in chunk "${chunkText.substring(0, 50)}..."`);
    return false;
  }

  /**
   * 创建诊断信息
   */
  private static createDiagnostic(suggestion: Suggestion, chunk: TextChunk): DiagnosticInfo {
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

    // 计算suggestion在chunk中的精确位置
    let range;
    try {
      console.log('-> Calculating precise range...');
      range = this.calculateSuggestionRange(suggestion, chunk);
      console.log('-> Range calculated successfully:', range);
    } catch (error) {
      console.warn(`-> Failed to calculate range for suggestion in chunk ${chunk.id}:`, error);
      // 使用chunk的起始位置作为fallback
      range = {
        start: { line: chunk.range.start.line, character: chunk.range.start.character },
        end: {
          line: chunk.range.start.line,
          character: Math.min(chunk.range.start.character + 50, chunk.range.end.character)
        }
      };
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
   * 计算suggestion在文档中的精确位置（词级精度）
   */
  private static calculateSuggestionRange(
    suggestion: Suggestion,
    chunk: TextChunk
  ): { start: { line: number; character: number }; end: { line: number; character: number } } {

    console.log('\n=== calculateSuggestionRange Debug ===');
    const chunkText = chunk.core_text;
    const searchText = suggestion.original_text;

    console.log('Chunk text length:', chunkText.length);
    console.log('Chunk text:', JSON.stringify(chunkText));
    console.log('Search text length:', searchText.length);
    console.log('Search text:', JSON.stringify(searchText));

    // 查找搜索文本在chunk中的位置
    let searchIndex = -1;

    // 尝试1: 精确匹配
    console.log('-> Trying exact match...');
    searchIndex = chunkText.indexOf(searchText);
    console.log('-> Exact match result:', searchIndex);

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
    if (searchIndex >= 0 && searchIndex + searchLength > chunkText.length) {
      searchLength = chunkText.length - searchIndex;
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
      endCharacter = startCharacter + matchedLines[0].length;
    } else {
      endCharacter = matchedLines[matchedLines.length - 1].length;
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