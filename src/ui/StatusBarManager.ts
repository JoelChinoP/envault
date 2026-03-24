import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext, private readonly storage: StorageService) {
    this.item         = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'workbench.view.extension.envault';
    context.subscriptions.push(this.item);
  }

  async update(): Promise<void> {
    const wsId = this.storage.getCurrentWorkspaceId();
    if (!wsId) { this.item.hide(); return; }

    const active = await this.storage.getActiveProfile(wsId);
    if (active) {
      this.item.text              = `$(key) ${active}`;
      this.item.tooltip           = `Envault · perfil activo: ${active}`;
      this.item.backgroundColor   = undefined;
    } else {
      this.item.text              = `$(warning) ENV sin perfil`;
      this.item.tooltip           = 'Envault · sin perfil activo';
      this.item.backgroundColor   = new vscode.ThemeColor('statusBarItem.warningBackground');
    }
    this.item.show();
  }
}
