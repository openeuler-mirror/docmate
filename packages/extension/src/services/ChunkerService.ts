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
    const text = this.cleanText(codeBlockLines.join('\n') + (endIndex < lines.length ? '\n' : ''), 'codeblock');

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
    const text = this.cleanText(tableLines.join('\n') + (endIndex < lines.length ? '\n' : ''), 'table');

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
    const text = this.cleanText(headingLine + (startIndex < lines.length - 1 ? '\n' : ''), 'heading');

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

    const text = this.cleanText(contentLines.join('\n') + (endIndex < lines.length ? '\n' : ''), 'heading');

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
    const text = this.cleanText(listLines.join('\n') + (endIndex < lines.length ? '\n' : ''), 'list');

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
      const chunkText = this.cleanText(chunkLines.join(''), 'list');
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
    const text = this.cleanText(blockquoteLines.join('\n') + (endIndex < lines.length ? '\n' : ''), 'blockquote');

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
    const text = this.cleanText(paragraphLines.join('\n'), 'paragraph');

    return {
      text,
      lineCount: endIndex - startIndex,
      startIndex: this.getLineOffset(lines, startIndex)
    };
  }

  /**
   * 智能文本清理 - 根据文本类型应用不同的清理策略
   */
  private static cleanText(text: string, type: string = 'paragraph'): string {
    // 基础清理：移除回车符，保留换行符
    let cleaned = text.replace(/\r/g, '');

    // 根据文本类型应用特定的清理逻辑
    switch (type) {
      case 'heading':
        return this.cleanHeadingText(cleaned);
      case 'codeblock':
        return this.cleanCodeBlockText(cleaned);
      case 'table':
        return this.cleanTableText(cleaned);
      case 'list':
        return this.cleanListText(cleaned);
      case 'blockquote':
        return this.cleanBlockquoteText(cleaned);
      case 'paragraph':
      default:
        return this.cleanParagraphText(cleaned);
    }
  }

  /**
   * 清理标题文本 - 严格保持原有格式
   */
  private static cleanHeadingText(text: string): string {
    // 标题文本保持原样，只移除干扰字符
    return text.replace(/[ \t]+$/gm, '');
  }

  /**
   * 清理代码块文本 - 保持代码格式完整性
   */
  private static cleanCodeBlockText(text: string): string {
    // 代码块完全保持原样，只移除\r
    return text;
  }

  /**
   * 清理表格文本 - 保持表格结构
   */
  private static cleanTableText(text: string): string {
    // 表格保持结构，只移除行尾空白
    return text.replace(/[ \t]+$/gm, '');
  }

  /**
   * 清理列表文本 - 保持列表格式
   */
  private static cleanListText(text: string): string {
    // 列表项保持格式，只移除行尾空白
    return text.replace(/[ \t]+$/gm, '');
  }

  /**
   * 清理引用块文本 - 保持引用格式
   */
  private static cleanBlockquoteText(text: string): string {
    // 引用块保持格式，只移除行尾空白
    return text.replace(/[ \t]+$/gm, '');
  }

  /**
   * 清理段落文本 - 智能处理句子完整性
   */
  private static cleanParagraphText(text: string): string {
    // 移除多余空白字符，但保留段落结构
    let cleaned = text.replace(/[ \t]+$/gm, '');

    // 智能处理段落末尾的句子完整性
    cleaned = this.ensureSentenceCompleteness(cleaned);

    return cleaned;
  }

  /**
   * 确保段落中句子的完整性 - 只在必要时添加标点
   */
  private static ensureSentenceCompleteness(text: string): string {
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // 跳过空行
      if (!line) continue;

      // 检查是否需要添加句末标点
      if (this.shouldAddEndingPunctuation(line)) {
        // 只在段落内部或者段落末尾才添加标点
        const isLastLine = i === lines.length - 1;
        const nextLine = i < lines.length - 1 ? lines[i + 1].trim() : '';
        const isParagraphEnd = isLastLine || !nextLine;

        // 如果是段落末尾且不是标题、列表等特殊格式
        if (isParagraphEnd && !this.isSpecialFormatLine(line)) {
          // 保持原有的缩进格式
          const originalLine = lines[i];
          const leadingWhitespace = originalLine.match(/^\s*/)?.[0] || '';
          lines[i] = leadingWhitespace + this.addAppropriatePunctuation(line);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * 判断是否应该为行添加结束标点
   */
  private static shouldAddEndingPunctuation(line: string): boolean {
    // 如果已经以标点符号结尾，不需要添加
    const endingPunctuation = '[\u3002\uFF1B\uFF1A\uFF0C\uFF08\uFF09\uFF1F\uFF01\u2026\\.\\,!\\?;:"\']$';
    if (new RegExp(endingPunctuation).test(line)) {
      return false;
    }

    // 如果是标题、列表项等特殊格式，不添加标点
    if (this.isSpecialFormatLine(line)) {
      return false;
    }

    // 如果包含代码、URL等特殊内容，不添加标点
    if (line.includes('`') || line.includes('http') || line.includes('www.')) {
      return false;
    }

    // 如果主要是英文单词且很短，可能是不完整的句子
    const chineseCharRatio = (line.match(/[\u4e00-\u9fa5]/g) || []).length / line.length;
    if (chineseCharRatio < 0.3 && line.length < 10) {
      return false;
    }

    // 如果包含中文且看起来是完整的句子，建议添加标点
    if (line.length > 5 && /[\u4e00-\u9fa5]/.test(line)) {
      return true;
    }

    return false;
  }

  /**
   * 判断是否为特殊格式行
   */
  private static isSpecialFormatLine(line: string): boolean {
    return line.startsWith('#') ||           // 标题
           line.startsWith('>') ||            // 引用
           line.startsWith('```') ||          // 代码块标记
           line.startsWith('-') ||            // 无序列表
           line.startsWith('*') ||            // 无序列表
           line.startsWith('+') ||            // 无序列表
           line.match(/^\d+\./) ||            // 有序列表
           line.includes('|') && line.split('|').length >= 3 ||  // 表格
           line.match(/^\s*$/);               // 空行
  }

  /**
   * 为文本添加适当的结束标点
   */
  private static addAppropriatePunctuation(text: string): string {
    // 移除末尾空白
    let trimmed = text.trim();

    // 根据内容类型决定添加什么标点
    if (trimmed.includes('？') || trimmed.includes('吗') || trimmed.includes('呢')) {
      return trimmed + '？';
    } else if (trimmed.includes('！') || trimmed.includes('啊') || trimmed.includes('呀')) {
      return trimmed + '！';
    } else {
      return trimmed + '。';
    }
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