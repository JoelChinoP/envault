import * as vscode from 'vscode';
import { StorageService } from './storage/StorageService';
import { EnvTreeProvider } from './providers/EnvTreeProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { EnvWriter } from './services/EnvWriter';
import { registerProfileCommands } from './commands/profileCommands';
import { registerWorkspaceViewCommands } from './commands/workspaceViewCommands';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageService(context);
  const envWriter = new EnvWriter();
  const statusBar = new StatusBarManager(context, storage);
  const treeProvider = new EnvTreeProvider(storage);

  const treeView = vscode.window.createTreeView('envaultTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  const workspaceViewCommands = registerWorkspaceViewCommands({
    context,
    storage,
    treeProvider,
  });
  const profileCommands = registerProfileCommands({
    context,
    storage,
    treeProvider,
    statusBar,
    envWriter,
  });

  void workspaceViewCommands.restoreWorkspaceViewMode();

  context.subscriptions.push(
    treeView,
    ...workspaceViewCommands.disposables,
    ...profileCommands,

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void workspaceViewCommands.restoreWorkspaceViewMode();
      treeProvider.refresh();
      void statusBar.update();
    }),
  );

  void statusBar.update();
}

export function deactivate(): void {}
