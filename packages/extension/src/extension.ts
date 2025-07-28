import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export async function activate(context: vscode.ExtensionContext) {
  console.log('DocMate extension is now active!');

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
  registerCommands(context, sidebarProvider);

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

function registerCommands(context: vscode.ExtensionContext, sidebarProvider: SidebarProvider) {
  // 检查文档命令
  const checkCommand = vscode.commands.registerCommand('docmate.check', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文档');
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) {
      vscode.window.showWarningMessage('请先选择要检查的文本');
      return;
    }

    await sidebarProvider.executeCommand('check', { text: selectedText });
  });

  // 润色文本命令
  const polishCommand = vscode.commands.registerCommand('docmate.polish', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文档');
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) {
      vscode.window.showWarningMessage('请先选择要润色的文本');
      return;
    }

    await sidebarProvider.executeCommand('polish', { text: selectedText });
  });

  // 翻译文本命令
  const translateCommand = vscode.commands.registerCommand('docmate.translate', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文档');
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) {
      vscode.window.showWarningMessage('请先选择要翻译的文本');
      return;
    }

    // 询问目标语言
    const targetLanguage = await vscode.window.showQuickPick([
      { label: 'English', value: 'en-US' },
      { label: '中文', value: 'zh-CN' },
    ], {
      placeHolder: '选择目标语言'
    });

    if (!targetLanguage) {
      return;
    }

    await sidebarProvider.executeCommand('translate', {
      text: selectedText,
      options: { targetLanguage: targetLanguage.value }
    });
  });

  // 改写文本命令
  const rewriteCommand = vscode.commands.registerCommand('docmate.rewrite', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('请先打开一个文档');
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    if (!selectedText.trim()) {
      vscode.window.showWarningMessage('请先选择要改写的文本');
      return;
    }

    // 询问改写指令
    const instruction = await vscode.window.showInputBox({
      prompt: '请输入改写指令（例如：让这段文字更简洁、改为更正式的语调等）',
      placeHolder: '描述您希望如何改写选中的文本...',
      value: '',
      validateInput: (value) => {
        if (!value.trim()) {
          return '请输入改写指令';
        }
        return null;
      }
    });

    if (!instruction) {
      return;
    }

    // 打开侧边栏并发送改写命令
    await vscode.commands.executeCommand('docmate.sidebar.focus');
    await sidebarProvider.executeCommand('rewrite', {
      text: instruction,
      originalText: selectedText,
      conversationHistory: []
    });
  });

  context.subscriptions.push(checkCommand, polishCommand, translateCommand, rewriteCommand);
}

export function deactivate() {
  console.log('DocMate extension is now deactivated');
}
