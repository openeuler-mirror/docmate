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

      // 尝试直接替换
      const success = await editor.edit(editBuilder => {
        editBuilder.replace(range, data.suggested_text);
      });

      if (success) {
        vscode.window.showInformationMessage('已应用修复建议');
        return;
      }

      // 如果直接替换失败，尝试智能匹配
      const smartResult = await SmartApplyService.applyTextSuggestion(
        data.suggested_text,
        data.original_text,
        editor
      );

      if (smartResult.success) {
        vscode.window.showInformationMessage(`已应用修复建议（${smartResult.message}）`);
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