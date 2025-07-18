import * as vscode from 'vscode';
import * as path from 'path';
import { ActionController } from './controllers/ActionController';
import { UICommand, HostResult, ExtendedUICommand, ExtendedHostResult, isUICommand } from '@docmate/shared';

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'docmate.sidebar';

  private _view?: vscode.WebviewView;
  private _actionController: ActionController;

  constructor(private readonly _extensionUri: vscode.Uri) {
    this._actionController = new ActionController();
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
  private async handleUICommand(command: UICommand | ExtendedUICommand): Promise<void> {
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
            command: 'renderCheckResult',
            payload: {
              type: 'check',
              diffs: result.diffs,
              issues: result.issues
            }
          } as ExtendedHostResult);
          break;
        case 'polish':
          this.sendToWebview({
            command: 'renderPolishResult',
            payload: {
              type: 'polish',
              diffs: result.diffs
            }
          } as ExtendedHostResult);
          break;
        case 'translate':
          this.sendToWebview({
            command: 'renderTranslateResult',
            payload: {
              type: 'translate',
              diffs: result.diffs,
              sourceLang: result.sourceLang,
              targetLang: result.targetLang
            }
          } as ExtendedHostResult);
          break;
        case 'rewrite':
          this.sendToWebview({
            command: 'renderRewriteResult',
            payload: {
              type: 'rewrite',
              diffs: result.diffs,
              conversationId: result.conversationId,
              conversation: command.payload.conversationHistory || []
            }
          } as ExtendedHostResult);
          break;
        case 'applySuggestion':
          // applySuggestion命令已经在handleUICommand中执行了，这里只需要发送成功响应
          this.sendToWebview({
            command: 'ready',
            payload: { status: 'applied' }
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
      this.sendErrorToWebview(error instanceof Error ? error.message : 'Unknown error');
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
  private sendToWebview(message: HostResult | ExtendedHostResult): void {
    if (this._view) {
      this._view.webview.postMessage(message);
    }
  }

  /**
   * 发送错误消息到webview
   */
  private sendErrorToWebview(error: string): void {
    this.sendToWebview({
      command: 'error',
      payload: { error }
    });
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
      vscode.Uri.joinPath(this._extensionUri, 'packages', 'ui', 'dist', 'index.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'packages', 'ui', 'dist', 'ui.css')
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
