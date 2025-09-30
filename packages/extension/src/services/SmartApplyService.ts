import * as vscode from 'vscode';
import { ErrorHandlingService } from './ErrorHandlingService';
import { ErrorCode } from '@docmate/shared';
import { diffWords } from 'diff';

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

    if (!activeEditor.selection.isEmpty) {
      const success = await activeEditor.edit(editBuilder => {
        editBuilder.replace(activeEditor.selection, text);
      });
      return {
        success,
        message: success ? '已应用建议' : '应用失败'
      };
    }

    if (!originalText) {
      throw ErrorHandlingService.createError(
        ErrorCode.ORIGINAL_TEXT_NOT_FOUND,
        '无选择文本且无原文信息，无法应用建议'
      );
    }

    const patchMatch = await this.tryPatchApply(activeEditor, originalText, text);
    if (patchMatch.success) {
      return patchMatch;
    }

    const exactMatch = await this.tryExactMatch(activeEditor, originalText, text);
    if (exactMatch.success) {
      return exactMatch;
    }

    const fuzzyMatch = await this.tryFuzzyMatch(activeEditor, originalText, text);
    if (fuzzyMatch.success) {
      return fuzzyMatch;
    }

    return await this.showUserSelection(activeEditor, originalText, text);
  }

  /**
   * 尝试使用diff库的patch功能应用文本
   */
  private static async tryPatchApply(
    editor: vscode.TextEditor,
    originalText: string,
    newText: string
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const documentText = editor.document.getText();

      if (documentText.includes(originalText)) {
        const originalIndex = documentText.indexOf(originalText);
        const startPos = editor.document.positionAt(originalIndex);
        const endPos = editor.document.positionAt(originalIndex + originalText.length);
        const range = new vscode.Range(startPos, endPos);

        const success = await editor.edit(editBuilder => {
          editBuilder.replace(range, newText);
        });

        if (success) {
          return {
            success: true,
            message: '已使用精确匹配应用建议'
          };
        }
      }

      const diffResult = diffWords(originalText, newText);
      const changes = diffResult.filter(part => part.added || part.removed);

      if (changes.length <= 4) {
        // 查找最佳匹配位置
        const bestMatchIndex = this.findBestMatchIndex(documentText, originalText);
        if (bestMatchIndex !== -1) {
          const startPos = editor.document.positionAt(bestMatchIndex);
          const endPos = editor.document.positionAt(bestMatchIndex + originalText.length);
          const range = new vscode.Range(startPos, endPos);

          const success = await editor.edit(editBuilder => {
            editBuilder.replace(range, newText);
          });

          if (success) {
            return {
              success: true,
              message: '已使用智能分析应用建议'
            };
          }
        }
      }
    } catch (error) {
      console.debug('Smart patch apply failed:', error);
    }

    return { success: false };
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

    const matchCandidates = [
      originalText,
      originalText.trim(),
      originalText.replace(/\s+/g, ' ').trim(),
      originalText.replace(/^\s+|\s+$/g, '')
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
   * 查找最佳匹配位置
   */
  private static findBestMatchIndex(documentText: string, targetText: string): number {
    // 尝试精确匹配
    let index = documentText.indexOf(targetText);
    if (index !== -1) {
      return index;
    }

    // 尝试规范化匹配（处理空格差异）
    const normalizedTarget = targetText.replace(/\s+/g, ' ').trim();
    const words = normalizedTarget.split(' ');

    // 寻找第一个关键词
    if (words.length > 0) {
      const firstWord = words[0];
      index = documentText.indexOf(firstWord);

      if (index !== -1) {
        // 验证周围上下文是否匹配
        const contextStart = Math.max(0, index - 10);
        const contextEnd = Math.min(documentText.length, index + targetText.length + 10);
        const context = documentText.substring(contextStart, contextEnd);

        // 检查上下文中是否包含足够多的目标文本内容
        let matchScore = 0;
        for (const word of words) {
          if (context.includes(word)) {
            matchScore++;
          }
        }

        // 如果匹配度超过50%，认为是有效匹配
        if (matchScore / words.length >= 0.5) {
          return index;
        }
      }
    }

    return -1;
  }

  /**
   * 计算文本相似度 - 使用基于词级的更高效算法
   */
  private static calculateSimilarity(text1: string, text2: string): number {
    // 快速检查：完全相同
    if (text1 === text2) return 1;

    // 快速检查：有一个为空
    if (text1.length === 0 || text2.length === 0) return 0;

    // 计算编辑距离的优化版本
    const len1 = text1.length;
    const len2 = text2.length;

    // 如果长度差异太大，相似度直接降低
    const lengthRatio = Math.min(len1, len2) / Math.max(len1, len2);
    if (lengthRatio < 0.5) return lengthRatio * 0.5;

    // 使用动态规划计算编辑距离
    const matrix: number[][] = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));

    // 初始化边界条件
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;

    // 填充DP表
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,     // 删除
          matrix[i][j - 1] + 1,     // 插入
          matrix[i - 1][j - 1] + cost // 替换
        );
      }
    }

    const distance = matrix[len1][len2];
    const maxLength = Math.max(len1, len2);

    // 结合长度比例和编辑距离计算相似度
    const editSimilarity = 1 - (distance / maxLength);
    return editSimilarity * 0.7 + lengthRatio * 0.3; // 加权平均
  }
}
