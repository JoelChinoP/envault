import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';

export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor(
    context: vscode.ExtensionContext,
    private readonly storage: StorageService
  ) {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    // Click opens the ENV Manager sidebar
    this.item.command = 'workbench.view.extension.env-manager';
    context.subscriptions.push(this.item);
  }

  async update(): Promise<void> {
    const wsId = this.storage.getCurrentWorkspaceId();
    if (!wsId) {
      this.item.hide();
      return;
    }

    const active = await this.storage.getActiveProfile(wsId);

    if (active) {
      this.item.text = `$(key) ENV: ${active}`;
      this.item.tooltip = `Perfil activo: ${active}\nClick para gestionar perfiles`;
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = `$(warning) ENV: sin perfil`;
      this.item.tooltip = 'Sin perfil activo\nClick para gestionar perfiles';
      this.item.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
    }

    this.item.show();
  }
}
