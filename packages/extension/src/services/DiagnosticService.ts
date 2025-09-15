import * as vscode from 'vscode';
import { DiagnosticInfo } from '@docmate/shared';
import { ErrorHandlingService } from './ErrorHandlingService';
import { ErrorCode } from '@docmate/shared';
import { SmartApplyService } from '../services/SmartApplyService';

/**
 * 诊断服务 - 使用VS Code原生Diagnostic API
 * 负责在编辑器中显示精确的错误标记和提供快速修复
 */
export class DiagnosticService {

  private static diagnosticCollection: vscode.DiagnosticCollection;
  private static context: vscode.ExtensionContext;

  /**
   * 初始化诊断服务
   */
  public static initialize(context: vscode.ExtensionContext): void {
    this.context = context;
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('docmate');
    context.subscriptions.push(this.diagnosticCollection);
  }

  /**
   * 显示诊断信息
   * @param uri 文档URI
   * @param diagnostics 诊断信息数组
   */
  public static showDiagnostics(uri: vscode.Uri, diagnostics: DiagnosticInfo[]): void {
    if (!this.diagnosticCollection) {
      console.warn('Diagnostic service not initialized');
      return;
    }

    const vscodeDiagnostics: vscode.Diagnostic[] = diagnostics.map(diagnostic => {
      const range = new vscode.Range(
        diagnostic.range.start.line,
        diagnostic.range.start.character,
        diagnostic.range.end.line,
        diagnostic.range.end.character
      );

      const severity = this.convertSeverity(diagnostic.severity);

      const vscodeDiagnostic = new vscode.Diagnostic(
        range,
        diagnostic.message,
        severity
      );

      // 设置诊断源
      vscodeDiagnostic.source = diagnostic.source;

      // 设置诊断代码
      if (diagnostic.code) {
        vscodeDiagnostic.code = diagnostic.code;
      }

      // 添加数据信息，用于快速修复
      vscodeDiagnostic.data = {
        original_text: diagnostic.original_text,
        suggested_text: diagnostic.suggested_text,
        suggestion_type: diagnostic.suggestion_type
      };

      return vscodeDiagnostic;
    });

    // 清除之前的诊断信息
    this.diagnosticCollection.delete(uri);

    // 设置新的诊断信息
    this.diagnosticCollection.set(uri, vscodeDiagnostics);
  }

  /**
   * 清除指定文档的诊断信息
   * @param uri 文档URI
   */
  public static clearDiagnostics(uri?: vscode.Uri): void {
    if (!this.diagnosticCollection) {
      return;
    }

    if (uri) {
      this.diagnosticCollection.delete(uri);
    } else {
      this.diagnosticCollection.clear();
    }
  }

  /**
   * 清除特定诊断信息（基于原始文本）
   * @param uri 文档URI
   * @param originalText 原始文本
   */
  public static clearSpecificDiagnostics(uri: vscode.Uri, originalText: string): void {
    if (!this.diagnosticCollection) {
      return;
    }

    const currentDiagnostics = this.diagnosticCollection.get(uri) || [];
    if (currentDiagnostics.length === 0) {
      return;
    }

    console.log(`clearSpecificDiagnostics: Looking for diagnostics matching: "${originalText.substring(0, 50)}..."`);
    console.log(`clearSpecificDiagnostics: Found ${currentDiagnostics.length} total diagnostics`);

    // 过滤出需要保留的诊断信息
    const filteredDiagnostics = currentDiagnostics.filter(diagnostic => {
      const data = (diagnostic as any).data;
      if (!data || !data.original_text) {
        console.log(`clearSpecificDiagnostics: Keeping diagnostic without data`);
        return true; // 保留没有数据的诊断
      }

      console.log(`clearSpecificDiagnostics: Comparing with diagnostic data: "${data.original_text.substring(0, 50)}..."`);

      // 使用多种匹配策略
      const isMatch = this.isTextMatch(data.original_text, originalText);
      if (isMatch) {
        console.log(`clearSpecificDiagnostics: Removing matching diagnostic`);
        return false; // 移除匹配的诊断
      }

      console.log(`clearSpecificDiagnostics: Keeping non-matching diagnostic`);
      return true; // 保留不匹配的诊断
    });

    // 重新设置过滤后的诊断信息
    this.diagnosticCollection.set(uri, filteredDiagnostics);
    console.log(`clearSpecificDiagnostics: Cleared ${currentDiagnostics.length - filteredDiagnostics.length} diagnostics, ${filteredDiagnostics.length} remaining`);
  }

  /**
   * 检查两个文本是否匹配（使用多种匹配策略）
   */
  private static isTextMatch(text1: string, text2: string): boolean {
    // 完全匹配
    if (text1 === text2) {
      return true;
    }

    // 去除前后空格后匹配
    if (text1.trim() === text2.trim()) {
      return true;
    }

    // 标准化空白符后匹配
    const normalized1 = text1.replace(/\s+/g, ' ').trim();
    const normalized2 = text2.replace(/\s+/g, ' ').trim();
    if (normalized1 === normalized2) {
      return true;
    }

    // 部分匹配（如果一个文本包含另一个）
    if (text1.includes(text2) || text2.includes(text1)) {
      return true;
    }

    return false;
  }

  /**
   * 注册快速修复命令
   */
  public static registerQuickFixCommands(): void {
    if (!this.context) {
      return;
    }

    // 注册快速修复命令
    const quickFixCommand = vscode.commands.registerCommand(
      'docmate.quickFix',
      async (uri: vscode.Uri, range: vscode.Range, diagnostic: vscode.Diagnostic) => {
        await this.applyQuickFix(uri, range, diagnostic);
      }
    );

    this.context.subscriptions.push(quickFixCommand);

    // 注册代码动作提供器
    const codeActionProvider = vscode.languages.registerCodeActionsProvider(
      { scheme: 'file' },
      new DocMateCodeActionProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      }
    );

    this.context.subscriptions.push(codeActionProvider);
  }

  /**
   * 应用快速修复 - 简化版本
   */
  private static async applyQuickFix(
    uri: vscode.Uri,
    range: vscode.Range,
    diagnostic: vscode.Diagnostic
  ): Promise<void> {
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.uri.toString() !== uri.toString()) {
        throw ErrorHandlingService.createError(ErrorCode.NO_ACTIVE_EDITOR, 'No active editor for this document');
      }

      const data = diagnostic.data as any;
      if (!data || !data.original_text || !data.suggested_text) {
        throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, 'Invalid diagnostic data');
      }

      // 简单验证范围有效性
      if (range.start.line < 0 || range.start.character < 0) {
        throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, 'Invalid range');
      }

      // 优先使用智能匹配，避免整行替换
      const smartResult = await SmartApplyService.applyTextSuggestion(
        data.suggested_text,
        data.original_text,
        editor
      );

      if (smartResult.success) {
        vscode.window.showInformationMessage(`已应用修复建议（${smartResult.message}）`);
        // 应用成功后清除相关的波浪线
        if (data.original_text) {
          this.clearSpecificDiagnostics(uri, data.original_text);
        }
        return;
      }

      // 如果智能匹配失败，才尝试直接替换range（作为最后的备选方案）
      console.warn('Smart apply failed, falling back to direct range replacement');
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, data.suggested_text);
      });

      if (success) {
        vscode.window.showInformationMessage('已应用修复建议（直接替换）');
        // 应用成功后清除相关的波浪线
        if (data.original_text) {
          this.clearSpecificDiagnostics(uri, data.original_text);
        }
      } else {
        throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, '无法应用修复建议');
      }

    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.UNKNOWN_ERROR);
      console.error('QuickFix: Error applying suggestion:', docMateError);
      vscode.window.showErrorMessage(`应用修复失败: ${docMateError.message}`);
    }
  }

  /**
   * 转换严重程度
   */
  private static convertSeverity(severity: string): vscode.DiagnosticSeverity {
    switch (severity) {
      case 'error':
        return vscode.DiagnosticSeverity.Error;
      case 'warning':
        return vscode.DiagnosticSeverity.Warning;
      case 'info':
        return vscode.DiagnosticSeverity.Information;
      default:
        return vscode.DiagnosticSeverity.Information;
    }
  }

  /**
   * 获取诊断统计信息
   */
  public static getDiagnosticStats(uri: vscode.Uri): {
    errors: number;
    warnings: number;
    infos: number;
    total: number;
  } {
    if (!this.diagnosticCollection) {
      return { errors: 0, warnings: 0, infos: 0, total: 0 };
    }

    const diagnostics = this.diagnosticCollection.get(uri) || [];
    const stats = {
      errors: 0,
      warnings: 0,
      infos: 0,
      total: diagnostics.length
    };

    diagnostics.forEach(diagnostic => {
      switch (diagnostic.severity) {
        case vscode.DiagnosticSeverity.Error:
          stats.errors++;
          break;
        case vscode.DiagnosticSeverity.Warning:
          stats.warnings++;
          break;
        case vscode.DiagnosticSeverity.Information:
          stats.infos++;
          break;
      }
    });

    return stats;
  }
}

/**
 * DocMate代码动作提供器
 */
class DocMateCodeActionProvider implements vscode.CodeActionProvider {

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token: vscode.CancellationToken
  ): vscode.ProviderResult<vscode.CodeAction[]> {

    const actions: vscode.CodeAction[] = [];

    // 只处理DocMate的诊断
    const docMateDiagnostics = context.diagnostics.filter(d => d.source === 'DocMate');

    for (const diagnostic of docMateDiagnostics) {
      const data = diagnostic.data as any;
      if (data && data.suggested_text) {
        const action = new vscode.CodeAction(
          `修复: ${diagnostic.message}`,
          vscode.CodeActionKind.QuickFix
        );

        action.diagnostics = [diagnostic];
        action.command = {
          command: 'docmate.quickFix',
          title: '应用修复',
          arguments: [document.uri, diagnostic.range, diagnostic]
        };

        actions.push(action);
      }
    }

    return actions;
  }
}