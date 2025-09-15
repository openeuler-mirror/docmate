import * as vscode from 'vscode';
import { TextChunk } from '@docmate/shared';

/**
 * 文本分块服务 - 重构版本
 * 使用从上到下的顺序分块，确保上下文连续性
 */
export class ChunkerService {

  /**
   * 对选中的文本进行分块处理
   * @param selectedText 选中的文本内容
   * @param selectionRange 选区在文档中的绝对位置
   * @param contextLines 上下文行数，默认为1
   * @returns TextChunk[] 分块结果
   */
  public static chunkText(
    selectedText: string,
    selectionRange: vscode.Range,
    contextLines: number = 1
  ): TextChunk[] {

    if (!selectedText || selectedText.trim().length === 0) {
      return [];
    }

    console.log('\n=== ChunkerService Debug Info ===');
    console.log('Original selected text length:', selectedText.length);
    console.log('Original selected text:', JSON.stringify(selectedText.substring(0, 200)) + (selectedText.length > 200 ? '...' : ''));
    console.log('Selection range:', selectionRange);
    console.log('Context lines:', contextLines);

    // 获取活动编辑器用于位置计算
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor found');
    }

    // 生成唯一的批次ID
    const batchId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 使用新的分块逻辑
    console.log('Selection range details:', {
      start: selectionRange.start,
      end: selectionRange.end,
      startLine: editor.document.lineAt(selectionRange.start.line).text,
      endLine: editor.document.lineAt(selectionRange.end.line).text
    });

    const chunks = this.sequentialChunking(selectedText, selectionRange, editor, contextLines, batchId);

    console.log('\n=== Final Chunking Results ===');
    console.log('Total chunks created:', chunks.length);
    chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}:`, {
        id: chunk.id,
        core_text_length: chunk.core_text.length,
        core_text: JSON.stringify(chunk.core_text),
        context_before: chunk.context_before ? JSON.stringify(chunk.context_before) : '[none]',
        context_after: chunk.context_after ? JSON.stringify(chunk.context_after) : '[none]',
        range: chunk.range
      });
    });

    return chunks;
  }

  /**
   * 顺序分块 - 从上到下，确保上下文连续性
   * 重构版本：每个块既作为上一个块的下文，又作为下一个块的上文
   */
  private static sequentialChunking(
    text: string,
    selectionRange: vscode.Range,
    editor: vscode.TextEditor,
    contextLines: number,
    batchId: string
  ): TextChunk[] {

    console.log('\n--- Starting Sequential Chunking ---');

    const chunks: TextChunk[] = [];
    let chunkCounter = 0;

    // 第一阶段：逐行累积式分块
    const rawChunks: {
      text: string;
      offset: number;
      length: number;
      range: vscode.Range;
    }[] = [];

    // 配置参数
    const MAX_CHUNK_LENGTH = 300;  // 最大chunk长度

    // 按行处理文本
    const lines = text.split('\n');
    let currentChunkText = '';
    let currentChunkStart = 0;
    let lineOffset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineWithNewline = line + (i < lines.length - 1 ? '\n' : '');

      // 检查是否为空行
      if (!line.trim()) {
        // 如果当前块有内容，先处理当前块
        if (currentChunkText.trim()) {
          const startPos = this.calculateAbsolutePosition(
            currentChunkStart,
            currentChunkText.length,
            selectionRange.start,
            editor.document
          );

          rawChunks.push({
            text: currentChunkText.trim(),
            offset: currentChunkStart,
            length: currentChunkText.length,
            range: new vscode.Range(startPos.start, startPos.end)
          });
        }

        // 重置当前块
        currentChunkText = '';
        currentChunkStart = lineOffset + lineWithNewline.length;
        lineOffset += lineWithNewline.length;
        continue;
      }

      // 检查添加这行是否会超过最大长度
      const potentialLength = currentChunkText.length + lineWithNewline.length;

      // 如果当前行为空或者添加后不超过最大长度，就添加到当前块
      if (!currentChunkText || potentialLength <= MAX_CHUNK_LENGTH) {
        currentChunkText += lineWithNewline;
        lineOffset += lineWithNewline.length;
      } else {
        // 如果当前块有内容，先处理当前块
        if (currentChunkText.trim()) {
          const startPos = this.calculateAbsolutePosition(
            currentChunkStart,
            currentChunkText.length,
            selectionRange.start,
            editor.document
          );

          rawChunks.push({
            text: currentChunkText.trim(),
            offset: currentChunkStart,
            length: currentChunkText.length,
            range: new vscode.Range(startPos.start, startPos.end)
          });
        }

        // 开始新块
        currentChunkText = lineWithNewline;
        currentChunkStart = lineOffset;
        lineOffset += lineWithNewline.length;
      }
    }

    // 处理最后一个块
    if (currentChunkText.trim()) {
      const startPos = this.calculateAbsolutePosition(
        currentChunkStart,
        currentChunkText.length,
        selectionRange.start,
        editor.document
      );

      rawChunks.push({
        text: currentChunkText.trim(),
        offset: currentChunkStart,
        length: currentChunkText.length,
        range: new vscode.Range(startPos.start, startPos.end)
      });
    }

    console.log(`Raw chunks created: ${rawChunks.length}`);

    // 第二阶段：按序创建最终的chunks，设置正确的上下文
    for (let i = 0; i < rawChunks.length; i++) {
      const currentChunk = rawChunks[i];

      // 获取上文：前面的chunks内容
      const contextBefore = this.getPreviousChunksContent(rawChunks, i - 1, contextLines * 2);

      // 获取下文：后面的chunks内容
      const contextAfter = this.getNextChunksContent(rawChunks, i + 1, contextLines * 2);

      const id = `chunk-${batchId}-${chunkCounter.toString().padStart(3, '0')}`;

      const finalChunk: TextChunk = {
        id,
        core_text: currentChunk.text,
        context_before: contextBefore,
        context_after: contextAfter,
        range: {
          start: {
            line: currentChunk.range.start.line,
            character: currentChunk.range.start.character
          },
          end: {
            line: currentChunk.range.end.line,
            character: currentChunk.range.end.character
          }
        }
      };

      chunks.push(finalChunk);
      chunkCounter++;

      console.log(`\n--- Final Chunk ${i + 1} ---`);
      console.log('ID:', id);
      console.log('Core text:', JSON.stringify(currentChunk.text));
      console.log('Context before:', JSON.stringify(contextBefore));
      console.log('Context after:', JSON.stringify(contextAfter));
    }

    console.log(`Sequential chunking completed: ${chunks.length} chunks created`);
    return chunks;
  }

  
  /**
   * 获取前面chunks的内容作为上文
   */
  private static getPreviousChunksContent(
    chunks: Array<{ text: string }>,
    startIndex: number,
    maxChunks: number
  ): string {
    if (startIndex < 0) {
      return '';
    }

    const contextChunks = [];
    for (let i = Math.max(0, startIndex - maxChunks + 1); i <= startIndex; i++) {
      contextChunks.push(chunks[i].text);
    }

    return contextChunks.join('\n').trim();
  }

  /**
   * 获取后面chunks的内容作为下文
   */
  private static getNextChunksContent(
    chunks: Array<{ text: string }>,
    startIndex: number,
    maxChunks: number
  ): string {
    if (startIndex >= chunks.length) {
      return '';
    }

    const contextChunks = [];
    for (let i = startIndex; i < Math.min(chunks.length, startIndex + maxChunks); i++) {
      contextChunks.push(chunks[i].text);
    }

    return contextChunks.join('\n').trim();
  }

  
  
  /**
   * 计算文本在文档中的绝对位置
   */
  private static calculateAbsolutePosition(
    localOffset: number,
    length: number,
    selectionStart: vscode.Position,
    document: vscode.TextDocument
  ): { start: vscode.Position; end: vscode.Position } {

    const absoluteStartOffset = document.offsetAt(selectionStart) + localOffset;
    const absoluteEndOffset = absoluteStartOffset + length;

    const startPosition = document.positionAt(absoluteStartOffset);
    const endPosition = document.positionAt(absoluteEndOffset);

    return { start: startPosition, end: endPosition };
  }

  
  /**
   * 验证分块结果的有效性
   */
  public static validateChunks(chunks: TextChunk[]): boolean {
    if (!Array.isArray(chunks) || chunks.length === 0) {
      return false;
    }

    return chunks.every(chunk =>
      chunk.id &&
      chunk.core_text &&
      chunk.core_text.trim().length > 0 &&
      chunk.range &&
      typeof chunk.range.start.line === 'number' &&
      typeof chunk.range.start.character === 'number' &&
      typeof chunk.range.end.line === 'number' &&
      typeof chunk.range.end.character === 'number'
    );
  }

  /**
   * 获取分块统计信息
   */
  public static getChunkStats(chunks: TextChunk[]): {
    totalChunks: number;
    totalLength: number;
    averageLength: number;
    maxLength: number;
    minLength: number;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalLength: 0,
        averageLength: 0,
        maxLength: 0,
        minLength: 0
      };
    }

    const lengths = chunks.map(chunk => chunk.core_text.length);
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);

    return {
      totalChunks: chunks.length,
      totalLength,
      averageLength: Math.round(totalLength / chunks.length),
      maxLength: Math.max(...lengths),
      minLength: Math.min(...lengths)
    };
  }
}