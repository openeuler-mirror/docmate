import * as vscode from 'vscode';
import { SidebarProvider } from './SidebarProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('DocMate extension is now active!');

  // 创建侧边栏提供者
  const sidebarProvider = new SidebarProvider(context.extensionUri);

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
      if (selectedText.trim()) {
        sidebarProvider.updateSelectedText(selectedText);
      }
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

  context.subscriptions.push(checkCommand, polishCommand, translateCommand);
}

export function deactivate() {
  console.log('DocMate extension is now deactivated');
}
