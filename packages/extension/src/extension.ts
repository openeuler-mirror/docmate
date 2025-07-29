import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';
import { TextSource } from '@docmate/shared';
import { AuthService } from './services/AuthService';
import { OAuthService } from './services/OAuthService';

export async function activate(context: vscode.ExtensionContext) {
  console.log('DocMate extension is now active!');

  // 初始化认证服务
  const authService = AuthService.getInstance(context.secrets);
  await authService.initialize();

  // 创建OAuth服务并注册URI处理器
  const oauthService = OAuthService.getInstance(authService);
  context.subscriptions.push(
    vscode.window.registerUriHandler(oauthService)
  );

  // 创建侧边栏提供者
  const sidebarProvider = new SidebarProvider(context.extensionUri);

  // 设置扩展上下文并初始化认证
  await sidebarProvider.setContext(context);

  // 注册侧边栏视图
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      SidebarProvider.viewType,
      sidebarProvider
    )
  );

  // 注册命令
  registerCommands(context, sidebarProvider, authService, oauthService);

  // 监听配置变化
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('docmate')) {
        sidebarProvider.updateConfiguration();
      }
    })
  );

  // 监听文本选择变化
  context.subscriptions.push(
    vscode.window.onDidChangeTextEditorSelection(e => {
      const selectedText = e.textEditor.document.getText(e.selections[0]);
      // 无论是否有选中文本都发送更新，这样可以清除之前的选中状态
      sidebarProvider.updateSelectedText(selectedText);
    })
  );
}

/**
 * 文本处理结果
 */
interface TextProcessingResult {
  text: string;
  source: TextSource;
}

/**
 * 智能获取文本进行处理
 * 优先使用选中文本，如无选择则使用全文
 */
function getTextForProcessing(): TextProcessingResult | null {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('请先打开一个文档');
    return null;
  }

  const selectedText = editor.document.getText(editor.selection);

  if (selectedText.trim()) {
    // 有选中文本，使用选中文本
    return {
      text: selectedText,
      source: 'selected'
    };
  } else {
    // 无选中文本，使用全文
    const fullText = editor.document.getText();
    if (!fullText.trim()) {
      vscode.window.showWarningMessage('文档内容为空');
      return null;
    }
    return {
      text: fullText,
      source: 'full'
    };
  }
}

/**
 * 执行文本处理操作的通用函数
 */
function executeTextOperation(
  callback: (result: TextProcessingResult) => void | Promise<void>
) {
  const result = getTextForProcessing();
  if (result) {
    callback(result);
  }
}

function registerCommands(context: vscode.ExtensionContext, sidebarProvider: SidebarProvider, authService: AuthService, oauthService: OAuthService) {
  // 检查文档命令
  const checkCommand = vscode.commands.registerCommand('docmate.check', () => {
    executeTextOperation(result => {
      sidebarProvider.executeCommand('check', {
        text: result.text,
        textSource: result.source
      });
    });
  });

  // 润色文本命令
  const polishCommand = vscode.commands.registerCommand('docmate.polish', () => {
    executeTextOperation(result => {
      sidebarProvider.executeCommand('polish', {
        text: result.text,
        textSource: result.source
      });
    });
  });

  // 翻译文本命令
  const translateCommand = vscode.commands.registerCommand('docmate.translate', () => {
    executeTextOperation(async result => {
      // 询问目标语言
      const targetLanguage = await vscode.window.showQuickPick(
        [
          { label: 'English', value: 'en-US' },
          { label: '中文', value: 'zh-CN' },
        ],
        {
          placeHolder: '选择目标语言',
        }
      );

      if (!targetLanguage) {
        return;
      }

      await sidebarProvider.executeCommand('translate', {
        text: result.text,
        textSource: result.source,
        options: { targetLanguage: targetLanguage.value },
      });
    });
  });

  // 改写文本命令
  const rewriteCommand = vscode.commands.registerCommand('docmate.rewrite', () => {
    executeTextOperation(async result => {
      // 询问改写指令
      const instruction = await vscode.window.showInputBox({
        prompt: '请输入改写指令（例如：让这段文字更简洁、改为更正式的语调等）',
        placeHolder: `描述您希望如何改写${result.source === 'selected' ? '选中的文本' : '全文'}...`,
        value: '',
        validateInput: value => {
          if (!value.trim()) {
            return '请输入改写指令';
          }
          return null;
        },
      });

      if (!instruction) {
        return;
      }

      // 打开侧边栏并发送改写命令
      await vscode.commands.executeCommand('docmate.sidebar.focus');
      await sidebarProvider.executeCommand('rewrite', {
        text: instruction,
        originalText: result.text,
        textSource: result.source,
        conversationHistory: [],
      });
    });
  });

  // 登录命令 - 直接使用OAuthService
  const loginCommand = vscode.commands.registerCommand('docmate.login', async () => {
    try {
      await oauthService.startLogin();

      // 检查登录状态
      if (authService.isAuthenticated()) {
        const userInfo = authService.getUserInfo();
        vscode.window.showInformationMessage(
          `登录成功！欢迎，${userInfo?.username || '用户'}！`
        );
      }
    } catch (error) {
      console.error('Login command failed:', error);
      vscode.window.showErrorMessage('登录失败，请重试');
    }
  });

  // 登出命令
  const logoutCommand = vscode.commands.registerCommand('docmate.logout', async () => {
    try {
      await authService.logout();
      vscode.window.showInformationMessage('已成功登出');
    } catch (error) {
      console.error('Logout command failed:', error);
      vscode.window.showErrorMessage('登出失败');
    }
  });

  context.subscriptions.push(checkCommand, polishCommand, translateCommand, rewriteCommand, loginCommand, logoutCommand);
}

export function deactivate() {
  console.log('DocMate extension is now deactivated');
}
