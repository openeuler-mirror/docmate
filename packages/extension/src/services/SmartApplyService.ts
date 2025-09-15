import * as vscode from 'vscode';
import { ErrorHandlingService } from './ErrorHandlingService';
import { ErrorCode } from '@docmate/shared';

/**
 * 智能应用服务
 * 处理无选择文本时的智能文本替换
 */
export class SmartApplyService {

  /**
   * 智能应用文本建议
   */
  static async applyTextSuggestion(
    text: string, 
    originalText?: string, 
    editor?: vscode.TextEditor
  ): Promise<{ success: boolean; message?: string }> {
    
    const activeEditor = editor || vscode.window.activeTextEditor;
    if (!activeEditor) {
      throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR);
    }

    // 如果有选择的文本，直接替换
    if (!activeEditor.selection.isEmpty) {
      const success = await activeEditor.edit(editBuilder => {
        editBuilder.replace(activeEditor.selection, text);
      });
      
      return { 
        success, 
        message: success ? '已应用建议' : '应用失败' 
      };
    }

    // 无选择文本的情况
    if (!originalText) {
      throw ErrorHandlingService.createError(
        ErrorCode.ORIGINAL_TEXT_NOT_FOUND,
        '无选择文本且无原文信息，无法应用建议'
      );
    }

    // 尝试精确匹配
    const exactMatch = await this.tryExactMatch(activeEditor, originalText, text);
    if (exactMatch.success) {
      return exactMatch;
    }

    // 尝试模糊匹配
    const fuzzyMatch = await this.tryFuzzyMatch(activeEditor, originalText, text);
    if (fuzzyMatch.success) {
      return fuzzyMatch;
    }

    // 提供用户选择
    return await this.showUserSelection(activeEditor, originalText, text);
  }

  /**
   * 尝试精确匹配
   */
  private static async tryExactMatch(
    editor: vscode.TextEditor,
    originalText: string,
    newText: string
  ): Promise<{ success: boolean; message?: string }> {

    const documentText = editor.document.getText();

    // 尝试多种匹配方式：原始文本、去除前后空格、标准化空白符
    const matchCandidates = [
      originalText,
      originalText.trim(),
      originalText.replace(/\s+/g, ' ').trim(),
      originalText.replace(/^\s+|\s+$/g, '') // 只去除前后空格，保留中间空白符
    ];

    for (const candidate of matchCandidates) {
      const originalIndex = documentText.indexOf(candidate);
      if (originalIndex !== -1) {
        const startPos = editor.document.positionAt(originalIndex);
        const endPos = editor.document.positionAt(originalIndex + candidate.length);
        const range = new vscode.Range(startPos, endPos);

        const success = await editor.edit(editBuilder => {
          editBuilder.replace(range, newText);
        });

        if (success) {
          return {
            success: true,
            message: `已精确匹配并应用建议 (使用${candidate === originalText ? '原始' : '处理后的'}文本)`
          };
        }
      }
    }

    return { success: false };
  }

  /**
   * 尝试模糊匹配
   */
  private static async tryFuzzyMatch(
    editor: vscode.TextEditor, 
    originalText: string, 
    newText: string
  ): Promise<{ success: boolean; message?: string }> {
    
    const documentText = editor.document.getText();
    const matches = this.findSimilarText(documentText, originalText);

    if (matches.length === 1) {
      // 只有一个相似匹配，直接应用
      const match = matches[0];
      const startPos = editor.document.positionAt(match.index);
      const endPos = editor.document.positionAt(match.index + match.length);
      const range = new vscode.Range(startPos, endPos);

      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, newText);
      });

      return { 
        success, 
        message: success ? `已模糊匹配并应用建议 (相似度: ${Math.round(match.similarity * 100)}%)` : '模糊匹配失败' 
      };
    }

    return { success: false };
  }

  /**
   * 显示用户选择界面
   */
  private static async showUserSelection(
    editor: vscode.TextEditor, 
    originalText: string, 
    newText: string
  ): Promise<{ success: boolean; message?: string }> {
    
    const documentText = editor.document.getText();
    const matches = this.findSimilarText(documentText, originalText, 0.3); // 降低阈值

    if (matches.length === 0) {
      throw ErrorHandlingService.createError(
        ErrorCode.ORIGINAL_TEXT_NOT_FOUND,
        '在文档中未找到相似的文本片段'
      );
    }

    // 创建QuickPick选项
    const items: vscode.QuickPickItem[] = matches.map((match, index) => {
      const startPos = editor.document.positionAt(match.index);
      const preview = match.text.length > 50 ? 
        match.text.substring(0, 47) + '...' : 
        match.text;
      
      return {
        label: `选项 ${index + 1}`,
        description: `第${startPos.line + 1}行 (相似度: ${Math.round(match.similarity * 100)}%)`,
        detail: preview,
        picked: index === 0
      };
    });

    // 添加取消选项
    items.push({
      label: '$(x) 取消',
      description: '不应用建议',
      detail: ''
    });

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: '选择要替换的文本片段',
      title: '找到多个相似文本，请选择要替换的片段'
    });

    if (!selected || selected.label.includes('取消')) {
      return { success: false, message: '用户取消操作' };
    }

    // 应用选择的匹配
    const selectedIndex = parseInt(selected.label.match(/\d+/)?.[0] || '1') - 1;
    const match = matches[selectedIndex];
    
    const startPos = editor.document.positionAt(match.index);
    const endPos = editor.document.positionAt(match.index + match.length);
    const range = new vscode.Range(startPos, endPos);

    const success = await editor.edit(editBuilder => {
      editBuilder.replace(range, newText);
    });

    return { 
      success, 
      message: success ? '已应用用户选择的建议' : '应用用户选择失败' 
    };
  }

  /**
   * 查找相似文本
   */
  private static findSimilarText(
    documentText: string, 
    targetText: string, 
    threshold: number = 0.6
  ): Array<{ index: number; length: number; text: string; similarity: number }> {
    
    const results: Array<{ index: number; length: number; text: string; similarity: number }> = [];
    const targetWords = targetText.split(/\s+/);
    const targetLength = targetText.length;
    
    // 滑动窗口搜索
    const windowSizes = [
      targetLength,
      Math.floor(targetLength * 1.2),
      Math.floor(targetLength * 0.8)
    ];

    for (const windowSize of windowSizes) {
      for (let i = 0; i <= documentText.length - windowSize; i += Math.floor(windowSize / 4)) {
        const candidate = documentText.substring(i, i + windowSize);
        const similarity = this.calculateSimilarity(targetText, candidate);
        
        if (similarity >= threshold) {
          // 检查是否与已有结果重叠
          const overlaps = results.some(r => 
            Math.abs(r.index - i) < Math.min(r.length, windowSize) * 0.5
          );
          
          if (!overlaps) {
            results.push({
              index: i,
              length: windowSize,
              text: candidate,
              similarity
            });
          }
        }
      }
    }

    // 按相似度排序
    return results.sort((a, b) => b.similarity - a.similarity).slice(0, 5);
  }

  /**
   * 计算文本相似度 (简化版Levenshtein距离)
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    const len1 = text1.length;
    const len2 = text2.length;
    
    if (len1 === 0) return len2 === 0 ? 1 : 0;
    if (len2 === 0) return 0;

    const matrix: number[][] = [];
    
    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    
    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);
    
    return 1 - (distance / maxLength);
  }
}
