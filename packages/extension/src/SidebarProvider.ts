import * as vscode from 'vscode';
import * as path from 'path';
import { ActionController } from './controllers/ActionController';
import { ErrorHandlingService } from './services/ErrorHandlingService';
import { UICommand, HostResult, isUICommand, DocMateError, ErrorCode } from '@docmate/shared';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'docmate.sidebar';

  private _view?: vscode.WebviewView;
  private _actionController: ActionController;
  private _context: vscode.ExtensionContext | null = null;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._actionController = new ActionController();
  }

  /**
   * 设置扩展上下文并初始化认证
   */
  public async setContext(context: vscode.ExtensionContext): Promise<void> {
    this._context = context;
    await this._actionController.initializeAuth(context.secrets, context);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      // 允许脚本在webview中运行
      enableScripts: true,
      // 限制webview只能访问特定的本地资源
      localResourceRoots: [
        this._extensionUri
      ]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // 监听来自webview的消息
    webviewView.webview.onDidReceiveMessage(async (data) => {
      try {
        if (isUICommand(data)) {
          await this.handleUICommand(data);
        }
      } catch (error) {
        console.error('Error handling webview message:', error);
        this.sendErrorToWebview(error instanceof Error ? error.message : 'Unknown error');
      }
    });

    // 发送初始化消息
    this.sendToWebview({
      command: 'ready',
      payload: {}
    });
  }

  /**
   * 处理UI命令
   */
  private async handleUICommand(command: UICommand): Promise<void> {
    console.log('SidebarProvider: Handling UI command:', command.command, 'with payload:', command.payload);

    try {
      // 显示加载状态
      this.sendToWebview({
        command: 'loading',
        payload: { loading: true }
      });

      // 执行命令
      console.log('SidebarProvider: Calling ActionController.handle...');
      const result = await this._actionController.handle(command.command, command.payload);
      console.log('SidebarProvider: ActionController.handle result:', result);

      // 根据命令类型发送不同格式的结果
      switch (command.command) {
        case 'check':
          this.sendToWebview({
            command: 'renderResult',
            result: result
          } as HostResult);
          break;
        case 'polish':
          this.sendToWebview({
            command: 'renderResult',
            result: result
          } as HostResult);
          break;
        case 'translate':
          this.sendToWebview({
            command: 'renderResult',
            result: result
          } as HostResult);
          break;
        case 'fullTranslate':
          console.log('SidebarProvider: Handling fullTranslate result:', result);
          // 全文翻译：创建新文件并显示结果
          await this.handleFullTranslateResult(result);
          break;
        case 'rewrite':
          this.sendToWebview({
            command: 'renderResult',
            result: result
          } as HostResult);
          break;
        case 'applySuggestion':
          // applySuggestion命令已经在handleUICommand中执行了，这里只需要发送成功响应
          this.sendToWebview({
            command: 'ready',
            payload: { status: 'applied' }
          } as HostResult);
          break;
        case 'clearDiagnostics':
          // 清除诊断信息命令
          this.sendToWebview({
            command: 'ready',
            payload: { status: 'cleared' }
          } as HostResult);
          break;
        case 'auth':
          // 认证命令响应
          this.sendToWebview({
            command: 'auth',
            result: result
          } as HostResult);
          break;
        case 'config':
          // 配置命令响应
          this.sendToWebview({
            command: 'config',
            result: result
          } as HostResult);
          break;
        default:
          // 兼容旧格式
          this.sendToWebview({
            command: 'renderResult',
            payload: {
              type: command.command as any,
              data: result
            }
          } as HostResult);
      }
    } catch (error) {
      console.error(`Error executing command ${command.command}:`, error);
      // 直接传递错误对象，不要转换成字符串
      this.sendErrorToWebview(error as Error);
    } finally {
      // 隐藏加载状态
      this.sendToWebview({
        command: 'loading',
        payload: { loading: false }
      });
    }
  }

  /**
   * 发送消息到webview
   */
  private sendToWebview(message: HostResult): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * 处理全文翻译结果
   */
  private async handleFullTranslateResult(result: any) {
    try {
      console.log('SidebarProvider: handleFullTranslateResult called with:', result);
      const { translatedText, suggestedFileName, sourceLang, targetLang } = result;

      // 创建新文档
      const newDocument = await vscode.workspace.openTextDocument({
        content: translatedText,
        language: 'markdown'
      });

      // 显示新文档
      await vscode.window.showTextDocument(newDocument);

      // 发送成功消息到webview
      this.sendToWebview({
        command: 'renderTranslateResult',
        payload: {
          type: 'fullTranslate',
          message: `翻译完成！已创建新文档。从 ${sourceLang} 翻译为 ${targetLang}`,
          suggestedFileName: suggestedFileName,
          success: true
        }
      } as HostResult);

      // 提示用户保存文件
      if (suggestedFileName) {
        const saveChoice = await vscode.window.showInformationMessage(
          `翻译完成！建议保存为: ${suggestedFileName}`,
          '保存为建议文件名',
          '手动保存'
        );

        if (saveChoice === '保存为建议文件名') {
          const currentWorkspace = vscode.workspace.workspaceFolders?.[0];
          if (currentWorkspace) {
            const suggestedPath = vscode.Uri.joinPath(currentWorkspace.uri, suggestedFileName);
            await vscode.workspace.fs.writeFile(suggestedPath, Buffer.from(translatedText, 'utf8'));
            await vscode.window.showTextDocument(suggestedPath);
          }
        }
      }
    } catch (error) {
      console.error('Error handling full translate result:', error);
      this.sendErrorToWebview('创建翻译文档失败');
    }
  }

  /**
   * 发送错误消息到webview
   */
  private sendErrorToWebview(error: string | Error | DocMateError): void {
    console.log('SidebarProvider: sendErrorToWebview called with:', error);

    let errorData: DocMateError;

    if (typeof error === 'string') {
      errorData = ErrorHandlingService.createError(ErrorCode.UNKNOWN_ERROR, error);
    } else if (error instanceof Error) {
      errorData = ErrorHandlingService.fromError(error);
    } else {
      errorData = error as DocMateError;
    }

    console.log('SidebarProvider: Processed error data:', errorData);

    // 生成友好消息
    const friendlyMessage = ErrorHandlingService.getFriendlyMessage(errorData);
    const suggestion = ErrorHandlingService.getSuggestedAction(errorData);

    console.log('SidebarProvider: Generated friendly message:', friendlyMessage);
    console.log('SidebarProvider: Generated suggestion:', suggestion);

    // 发送结构化错误信息
    const errorPayload = {
      error: friendlyMessage,
      code: errorData.code,
      details: errorData.details,
      suggestion: suggestion
    };

    console.log('SidebarProvider: Sending error payload to webview:', errorPayload);

    this.sendToWebview({
      command: 'error',
      payload: errorPayload
    });

    // 记录详细错误日志
    ErrorHandlingService.logError(errorData, 'SidebarProvider.sendErrorToWebview');
  }

  /**
   * 执行命令（供外部调用）
   */
  public async executeCommand(command: string, payload: any): Promise<void> {
    await this.handleUICommand({ command: command as any, payload });
  }

  /**
   * 更新配置
   */
  public updateConfiguration(): void {
    this._actionController.updateConfiguration();
  }



  /**
   * 更新选中的文本
   */
  public updateSelectedText(text: string): void {
    this.sendToWebview({
      command: 'renderResult',
      payload: {
        data: { text, type: 'selectedText' }
      }
    });
  }

  /**
   * 生成webview的HTML内容
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    // 获取UI包的资源路径
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'ui', 'index.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'ui', 'ui.css')
    );

    // 使用nonce来确保只有我们的脚本可以运行
    const nonce = getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; connect-src https:; img-src ${webview.cspSource} https: data:;">
        <link href="${styleUri}" rel="stylesheet">
        <title>DocMate Assistant</title>
      </head>
      <body>
        <div id="root">Loading DocMate...</div>
        <script nonce="${nonce}">
          // Polyfill for process object
          window.process = window.process || { env: { NODE_ENV: 'production' } };
          window.global = window.global || window;
          console.log('DocMate WebView loaded');
          console.log('Script URI:', '${scriptUri}');
          console.log('Style URI:', '${styleUri}');
        </script>
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
