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
      (vscodeDiagnostic as any).data = {
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

    // 过滤出需要保留的诊断信息
    const filteredDiagnostics = currentDiagnostics.filter(diagnostic => {
      const data = (diagnostic as any).data;
      if (!data || !data.original_text) {
        return true; // 保留没有数据的诊断
      }

      // 使用多种匹配策略
      const isMatch = this.isTextMatch(data.original_text, originalText);
      return !isMatch; // 保留不匹配的诊断
    });

    // 重新设置过滤后的诊断信息
    this.diagnosticCollection.set(uri, filteredDiagnostics);
  }

  /**
   * 检查两个文本是否匹配
   */
  private static isTextMatch(text1: string, text2: string): boolean {
    // 完全匹配
    if (text1 === text2) return true;

    // 标准化空白符后匹配（包含去除前后空格）
    const normalized1 = text1.replace(/\s+/g, ' ').trim();
    const normalized2 = text2.replace(/\s+/g, ' ').trim();
    if (normalized1 === normalized2) return true;

    // 部分匹配（一个文本包含另一个）
    return text1.includes(text2) || text2.includes(text1);
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
   * 应用快速修复 - 重构为直接精准替换
   * 直接使用LLM提供的original_text -> suggested_text映射
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

      const data = (diagnostic as any).data;
      if (!data || !data.original_text || !data.suggested_text) {
        throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, 'Invalid diagnostic data');
      }

      // 应用直接替换策略

      // 验证范围有效性
      if (range.start.line < 0 || range.start.character < 0) {
        throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, 'Invalid range');
      }

      // 策略1: 直接使用range替换（主要方法）
      const directReplaceSuccess = await this.applyDirectReplacement(
        editor, range, data.suggested_text, data.original_text
      );

      if (directReplaceSuccess) {
        vscode.window.showInformationMessage('已应用修复建议');
        // 应用成功后清除相关的波浪线
        if (data.original_text) {
          this.clearSpecificDiagnostics(uri, data.original_text);
        }
        return;
      }

      // 策略2: 如果直接替换失败，尝试基于文本内容的智能匹配
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

      throw ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, '无法应用修复建议');

    } catch (error) {
      const docMateError = ErrorHandlingService.fromError(error, ErrorCode.UNKNOWN_ERROR);
      vscode.window.showErrorMessage(`应用修复失败: ${docMateError.message}`);
    }
  }

  /**
   * 应用直接替换 - 使用精确的range和suggested_text
   */
  private static async applyDirectReplacement(
    editor: vscode.TextEditor,
    range: vscode.Range,
    suggestedText: string,
    originalText: string
  ): Promise<boolean> {
    try {
      const currentText = editor.document.getText(range);

      // 精确匹配或规范化匹配（处理空格差异）
      if (currentText === originalText ||
          currentText.replace(/\s+/g, ' ').trim() === originalText.replace(/\s+/g, ' ').trim()) {
        return await editor.edit(editBuilder => {
          editBuilder.replace(range, suggestedText);
        });
      }

      return false;
    } catch (error) {
      return false;
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

    return {
      errors: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length,
      warnings: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning).length,
      infos: diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Information).length,
      total: diagnostics.length
    };
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
      const data = (diagnostic as any).data;
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