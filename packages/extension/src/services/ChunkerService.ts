import * as vscode from 'vscode';
import { TextChunk } from '@docmate/shared';

/**
 * 基于 Markdown 结构感知的分块服务
 * 使用改进的正则表达式和状态机来精确识别 Markdown 结构
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

    console.log('\n=== Enhanced Markdown ChunkerService Debug Info ===');
    console.log('Original selected text length:', selectedText.length);
    console.log('Selection range:', selectionRange);
    console.log('Context lines:', contextLines);

    // 获取活动编辑器用于位置计算
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error('No active editor found');
    }

    // 生成唯一的批次ID
    const batchId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 使用增强的 Markdown 感知分块
    const chunks = this.enhancedMarkdownChunking(selectedText, selectionRange, editor, contextLines, batchId);

    console.log('\n=== Final Chunking Results ===');
    console.log('Total chunks created:', chunks.length);
    chunks.forEach((chunk, index) => {
      console.log(`Chunk ${index + 1}:`, {
        id: chunk.id,
        type: this.getChunkType(chunk.core_text),
        core_text_length: chunk.core_text.length,
        core_text: JSON.stringify(chunk.core_text.substring(0, 100)) + (chunk.core_text.length > 100 ? '...' : ''),
        context_before: chunk.context_before ? JSON.stringify(chunk.context_before.substring(0, 50)) + '...' : '[none]',
        context_after: chunk.context_after ? JSON.stringify(chunk.context_after.substring(0, 50)) + '...' : '[none]',
        range: chunk.range
      });
    });

    return chunks;
  }

  /**
   * 增强的 Markdown 感知分块
   * 使用状态机和改进的解析逻辑
   */
  private static enhancedMarkdownChunking(
    text: string,
    selectionRange: vscode.Range,
    editor: vscode.TextEditor,
    contextLines: number,
    batchId: string
  ): TextChunk[] {

    console.log('\n--- Starting Enhanced Markdown Chunking ---');

    try {
      const chunks: TextChunk[] = [];
      const lines = text.split('\n');
      let i = 0;
      let chunkIndex = 0;

      while (i < lines.length) {
        const line = lines[i];
        const lineTrimmed = line.trim();

        // 跳过空行
        if (!lineTrimmed) {
          i++;
          continue;
        }

        // 检测代码块
        if (lineTrimmed.startsWith('```')) {
          const codeBlock = this.extractCodeBlock(lines, i);
          if (codeBlock) {
            const chunk = this.createChunk(
              codeBlock.text,
              codeBlock.startIndex,
              codeBlock.text.length,
              selectionRange,
              editor,
              batchId,
              chunkIndex++,
              'codeblock'
            );
            chunks.push(chunk);
            i += codeBlock.lineCount;
            continue;
          }
        }

        // 检测表格
        if (this.isMarkdownTableLine(lineTrimmed) && this.looksLikeTableHeader(lines, i)) {
          const table = this.extractTable(lines, i);
          if (table) {
            const chunk = this.createChunk(
              table.text,
              table.startIndex,
              table.text.length,
              selectionRange,
              editor,
              batchId,
              chunkIndex++,
              'table'
            );
            chunks.push(chunk);
            i += table.lineCount;
            continue;
          }
        }

        // 检测标题 - 尝试与后续内容合并
        if (this.isMarkdownHeading(lineTrimmed)) {
          const headingWithContent = this.extractHeadingWithContent(lines, i);
          if (headingWithContent) {
            const chunk = this.createChunk(
              headingWithContent.text,
              headingWithContent.startIndex,
              headingWithContent.text.length,
              selectionRange,
              editor,
              batchId,
              chunkIndex++,
              'heading'
            );
            chunks.push(chunk);
            i += headingWithContent.lineCount;
            continue;
          }
        }

        // 检测列表 - 优化长列表处理
        if (this.isMarkdownListLine(lineTrimmed)) {
          const listChunks = this.extractSmartList(lines, i, selectionRange, editor, batchId, chunkIndex);
          if (listChunks.length > 0) {
            chunks.push(...listChunks);
            i += this.calculateTotalLines(listChunks, lines);
            chunkIndex += listChunks.length;
            continue;
          }
        }

        // 检测引用块
        if (lineTrimmed.startsWith('>')) {
          const blockquote = this.extractBlockquote(lines, i);
          if (blockquote) {
            const chunk = this.createChunk(
              blockquote.text,
              blockquote.startIndex,
              blockquote.text.length,
              selectionRange,
              editor,
              batchId,
              chunkIndex++,
              'blockquote'
            );
            chunks.push(chunk);
            i += blockquote.lineCount;
            continue;
          }
        }

        // 处理普通文本段落
        const paragraph = this.extractParagraph(lines, i);
        if (paragraph) {
          const chunk = this.createChunk(
            paragraph.text,
            paragraph.startIndex,
            paragraph.text.length,
            selectionRange,
            editor,
            batchId,
            chunkIndex++,
            'paragraph'
          );
          chunks.push(chunk);
          i += paragraph.lineCount;
          continue;
        }

        i++;
      }

      // 添加上下文信息
      this.addContextToChunks(chunks, contextLines);

      console.log(`Enhanced Markdown chunking completed: ${chunks.length} chunks created`);
      return chunks;
    } catch (error) {
      console.error('Error in enhanced Markdown chunking:', error);
      // 回退到简单分块
      return this.fallbackChunking(text, selectionRange, editor, contextLines, batchId);
    }
  }

  /**
   * 提取代码块
   */
  private static extractCodeBlock(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !lines[startIndex].trim().startsWith('```')) {
      return null;
    }

    const startLine = startIndex;
    let endIndex = startIndex + 1;

    // 找到代码块结束位置
    while (endIndex < lines.length && !lines[endIndex].trim().startsWith('```')) {
      endIndex++;
    }

    // 如果找到了结束标记，包含结束标记
    if (endIndex < lines.length && lines[endIndex].trim().startsWith('```')) {
      endIndex++;
    }

    const codeBlockLines = lines.slice(startLine, endIndex);
    const text = codeBlockLines.join('\n') + (endIndex < lines.length ? '\n' : '');

    return {
      text,
      lineCount: endIndex - startLine,
      startIndex: this.getLineOffset(lines, startLine)
    };
  }

  /**
   * 提取表格
   */
  private static extractTable(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !this.isMarkdownTableLine(lines[startIndex].trim())) {
      return null;
    }

    let endIndex = startIndex;

    // 找到表格结束位置
    while (endIndex < lines.length && this.isMarkdownTableLine(lines[endIndex].trim())) {
      endIndex++;
    }

    const tableLines = lines.slice(startIndex, endIndex);
    const text = tableLines.join('\n') + (endIndex < lines.length ? '\n' : '');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 提取标题（原方法，保持向后兼容）
   */
  private static extractHeading(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !this.isMarkdownHeading(lines[startIndex].trim())) {
      return null;
    }

    const headingLine = lines[startIndex];
    const text = headingLine + (startIndex < lines.length - 1 ? '\n' : '');

    return {
      text,
      lineCount: 1,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 提取标题及其关联内容
   */
  private static extractHeadingWithContent(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !this.isMarkdownHeading(lines[startIndex].trim())) {
      return null;
    }

    const headingLine = lines[startIndex];
    let contentLines: string[] = [headingLine];
    let endIndex = startIndex + 1;
    const maxContentLength = 500; // 标题+内容的最大长度
    let currentLength = headingLine.length + 1; // +1 for newline

    // 收集标题后的相关内容
    while (endIndex < lines.length) {
      const line = lines[endIndex];
      const trimmedLine = line.trim();

      // 遇到另一个标题时立即停止
      if (this.isMarkdownHeading(trimmedLine)) {
        break;
      }

      // 遇到其他特殊结构时停止
      if (trimmedLine.startsWith('```') ||
          trimmedLine.startsWith('>') ||
          this.isMarkdownTableLine(trimmedLine) ||
          this.isMarkdownListLine(trimmedLine)) {
        break;
      }

      // 遇到空行时停止（标题内容通常紧密相关）
      if (!trimmedLine && contentLines.length > 1) {
        break;
      }

      // 检查长度限制
      const lineWithNewline = line + (endIndex < lines.length - 1 ? '\n' : '');
      if (currentLength + lineWithNewline.length > maxContentLength && contentLines.length > 1) {
        break;
      }

      contentLines.push(line);
      currentLength += lineWithNewline.length;
      endIndex++;
    }

    const text = contentLines.join('\n') + (endIndex < lines.length ? '\n' : '');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 提取列表（原方法，保持向后兼容）
   */
  private static extractList(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !this.isMarkdownListLine(lines[startIndex].trim())) {
      return null;
    }

    let endIndex = startIndex;

    // 找到列表结束位置
    while (endIndex < lines.length) {
      const line = lines[endIndex];
      const trimmedLine = line.trim();

      // 空行表示列表结束
      if (!trimmedLine) {
        break;
      }

      // 如果不是列表行，检查是否是续行
      if (!this.isMarkdownListLine(trimmedLine)) {
        // 检查是否是缩进的续行
        if (line.startsWith('  ') || line.startsWith('\t')) {
          endIndex++;
          continue;
        }
        break;
      }

      endIndex++;
    }

    const listLines = lines.slice(startIndex, endIndex);
    const text = listLines.join('\n') + (endIndex < lines.length ? '\n' : '');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 智能提取列表 - 处理长列表和嵌套列表
   */
  private static extractSmartList(
    lines: string[],
    startIndex: number,
    selectionRange: vscode.Range,
    editor: vscode.TextEditor,
    batchId: string,
    baseChunkIndex: number
  ): TextChunk[] {
    if (startIndex >= lines.length || !this.isMarkdownListLine(lines[startIndex].trim())) {
      return [];
    }

    const chunks: TextChunk[] = [];
    const maxListItemLength = 300; // 单个列表项的最大长度

    // 先找到整个列表的范围
    let listEndIndex = startIndex;
    while (listEndIndex < lines.length) {
      const line = lines[listEndIndex];
      const trimmedLine = line.trim();

      if (!trimmedLine) {
        break; // 空行表示列表结束
      }

      if (!this.isMarkdownListLine(trimmedLine)) {
        // 检查是否是缩进的续行
        if (line.startsWith('  ') || line.startsWith('\t')) {
          listEndIndex++;
          continue;
        }
        break; // 非列表行且非缩进行，列表结束
      }

      listEndIndex++;
    }

    // 现在在整个列表范围内进行分块
    let currentIndex = startIndex;
    while (currentIndex < listEndIndex) {
      const currentLine = lines[currentIndex];
      const lineWithNewline = currentLine + (currentIndex < lines.length - 1 ? '\n' : '');

      // 如果当前行不是列表行，必须是缩进的嵌套内容
      if (!this.isMarkdownListLine(currentLine.trim())) {
        // 这应该是嵌套内容，添加到前一个chunk
        if (chunks.length > 0) {
          const lastChunk = chunks[chunks.length - 1];
          lastChunk.core_text += lineWithNewline;
          // 注意：这里需要更新range，但为了简化，我们暂时不处理
        }
        currentIndex++;
        continue;
      }

      // 开始新的chunk
      let chunkLines = [lineWithNewline];
      let chunkLength = lineWithNewline.length;
      let chunkEndIndex = currentIndex + 1;

      // 收集后续的列表项直到达到长度限制
      while (chunkEndIndex < listEndIndex) {
        const nextLine = lines[chunkEndIndex];
        const nextLineTrimmed = nextLine.trim();
        const nextLineWithNewline = nextLine + (chunkEndIndex < lines.length - 1 ? '\n' : '');

        // 如果不是列表行，检查是否是嵌套内容
        if (!this.isMarkdownListLine(nextLineTrimmed)) {
          if (nextLine.startsWith('  ') || nextLine.startsWith('\t')) {
            // 嵌套内容，包含在内
            chunkLines.push(nextLineWithNewline);
            chunkLength += nextLineWithNewline.length;
            chunkEndIndex++;
            continue;
          }
          break; // 遇到非列表内容，停止当前chunk
        }

        // 检查添加这个列表项是否会超过长度限制
        if (chunkLength + nextLineWithNewline.length > maxListItemLength) {
          break;
        }

        chunkLines.push(nextLineWithNewline);
        chunkLength += nextLineWithNewline.length;
        chunkEndIndex++;
      }

      // 创建chunk
      const chunkText = chunkLines.join('');
      const chunk = this.createChunk(
        chunkText,
        this.getLineOffset(lines, currentIndex),
        chunkText.length,
        selectionRange,
        editor,
        batchId,
        baseChunkIndex + chunks.length,
        'list'
      );
      chunks.push(chunk);

      currentIndex = chunkEndIndex;
    }

    return chunks;
  }

  /**
   * 提取引用块
   */
  private static extractBlockquote(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length || !lines[startIndex].trim().startsWith('>')) {
      return null;
    }

    let endIndex = startIndex;

    // 找到引用块结束位置
    while (endIndex < lines.length && lines[endIndex].trim().startsWith('>')) {
      endIndex++;
    }

    const blockquoteLines = lines.slice(startIndex, endIndex);
    const text = blockquoteLines.join('\n') + (endIndex < lines.length ? '\n' : '');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 提取段落
   */
  private static extractParagraph(lines: string[], startIndex: number): { text: string; lineCount: number; startIndex: number } | null {
    if (startIndex >= lines.length) {
      return null;
    }

    let endIndex = startIndex;
    const maxParagraphLength = 300;
    let currentLength = 0;

    while (endIndex < lines.length) {
      const line = lines[endIndex];
      const lineWithNewline = line + (endIndex < lines.length - 1 ? '\n' : '');

      // 如果遇到特殊结构，停止处理
      if (this.isSpecialMarkdownLine(line.trim())) {
        break;
      }

      // 空行表示段落结束
      if (!line.trim() && endIndex > startIndex) {
        break;
      }

      // 检查长度限制
      if (currentLength + lineWithNewline.length > maxParagraphLength && endIndex > startIndex) {
        break;
      }

      currentLength += lineWithNewline.length;
      endIndex++;
    }

    if (endIndex <= startIndex) {
      return null;
    }

    const paragraphLines = lines.slice(startIndex, endIndex);
    const text = paragraphLines.join('');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 创建 TextChunk
   */
  private static createChunk(
    text: string,
    startIndex: number,
    length: number,
    selectionRange: vscode.Range,
    editor: vscode.TextEditor,
    batchId: string,
    index: number,
    type: string
  ): TextChunk {
    const range = this.calculateAbsolutePosition(startIndex, length, selectionRange.start, editor.document);

    return {
      id: `chunk-${batchId}-${(index + 1).toString().padStart(3, '0')}`,
      core_text: text,
      context_before: '',
      context_after: '',
      range: {
        start: {
          line: range.start.line,
          character: range.start.character
        },
        end: {
          line: range.end.line,
          character: range.end.character
        }
      }
    };
  }

  /**
   * 计算 chunks 涵盖的总行数
   */
  private static calculateTotalLines(chunks: TextChunk[], lines: string[]): number {
    if (chunks.length === 0) return 0;

    const startOffset = chunks[0].range.start.line;
    const endOffset = chunks[chunks.length - 1].range.end.line;
    return endOffset - startOffset + 1;
  }

  /**
   * 为 chunks 添加上下文信息
   */
  private static addContextToChunks(chunks: TextChunk[], contextLines: number): void {
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // 获取上文
      if (i > 0) {
        const prevChunks = chunks.slice(Math.max(0, i - contextLines), i);
        chunk.context_before = prevChunks.map(c => c.core_text).join('\n\n').trim();
      }

      // 获取下文
      if (i < chunks.length - 1) {
        const nextChunks = chunks.slice(i + 1, Math.min(chunks.length, i + 1 + contextLines));
        chunk.context_after = nextChunks.map(c => c.core_text).join('\n\n').trim();
      }
    }
  }

  /**
   * 计算绝对位置
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
   * 获取行的偏移量
   */
  private static getLineOffset(lines: string[], startIndex: number): number {
    let offset = 0;
    for (let i = 0; i < startIndex; i++) {
      offset += lines[i].length + 1; // +1 for newline
    }
    return offset;
  }

  /**
   * 判断是否为特殊 Markdown 行
   */
  private static isSpecialMarkdownLine(line: string): boolean {
    return line.startsWith('```') ||
           line.startsWith('>') ||
           line.startsWith('#') ||
           this.isMarkdownTableLine(line) ||
           this.isMarkdownListLine(line);
  }

  /**
   * 判断是否为 Markdown 表格行
   */
  private static isMarkdownTableLine(line: string): boolean {
    return line.includes('|') && line.split('|').length >= 3;
  }

  /**
   * 判断是否像表格头
   */
  private static looksLikeTableHeader(lines: string[], index: number): boolean {
    if (index >= lines.length - 1) return false;
    const nextLine = lines[index + 1].trim();
    return nextLine.includes('|---') || nextLine.includes('|:---');
  }

  /**
   * 判断是否为 Markdown 标题
   */
  private static isMarkdownHeading(line: string): boolean {
    return line.startsWith('#') && line.length > 1;
  }

  /**
   * 判断是否为 Markdown 列表行
   */
  private static isMarkdownListLine(line: string): boolean {
    return line.match(/^[-*+]\s/) ||
           line.match(/^\d+\.\s/) ||
           line.match(/^\[[x\s]\]\s/);
  }

  /**
   * 推断块类型
   */
  private static getChunkType(text: string): string {
    if (text.includes('```')) return 'codeblock';
    if (text.includes('|') && text.split('\n').some(line => line.trim().includes('|---'))) return 'table';
    if (text.startsWith('#')) return 'heading';
    if (text.match(/^[-*+]\s/) || text.match(/^\d+\.\s/)) return 'list';
    if (text.startsWith('>')) return 'blockquote';
    return 'paragraph';
  }

  /**
   * 回退到原始分块方法
   */
  private static fallbackChunking(
    text: string,
    selectionRange: vscode.Range,
    editor: vscode.TextEditor,
    contextLines: number,
    batchId: string
  ): TextChunk[] {
    return [{
      id: `chunk-${batchId}-001`,
      core_text: text,
      context_before: '',
      context_after: '',
      range: {
        start: {
          line: selectionRange.start.line,
          character: selectionRange.start.character
        },
        end: {
          line: selectionRange.end.line,
          character: selectionRange.end.character
        }
      }
    }];
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
    typeDistribution: Record<string, number>;
  } {
    if (chunks.length === 0) {
      return {
        totalChunks: 0,
        totalLength: 0,
        averageLength: 0,
        maxLength: 0,
        minLength: 0,
        typeDistribution: {}
      };
    }

    const lengths = chunks.map(chunk => chunk.core_text.length);
    const totalLength = lengths.reduce((sum, len) => sum + len, 0);

    const typeDistribution: Record<string, number> = {};
    chunks.forEach(chunk => {
      const type = this.getChunkType(chunk.core_text);
      typeDistribution[type] = (typeDistribution[type] || 0) + 1;
    });

    return {
      totalChunks: chunks.length,
      totalLength,
      averageLength: Math.round(totalLength / chunks.length),
      maxLength: Math.max(...lengths),
      minLength: Math.min(...lengths),
      typeDistribution
    };
  }
}