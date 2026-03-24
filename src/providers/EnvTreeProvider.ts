import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import { WorkspaceMeta, EnvProfile } from '../types';

// ─── Tree items ───────────────────────────────────────────────────────────────

export class WorkspaceItem extends vscode.TreeItem {
  public readonly workspaceId: string;

  constructor(meta: WorkspaceMeta, isCurrentWorkspace: boolean) {
    super(
      meta.name,
      isCurrentWorkspace
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.workspaceId = meta.id;
    this.contextValue = 'workspace';
    this.description = meta.path;
    this.iconPath = new vscode.ThemeIcon('folder-library');
    this.tooltip = new vscode.MarkdownString(
      `**${meta.name}**\n\n\`${meta.path}\``,
    );
  }
}

export class ProfileItem extends vscode.TreeItem {
  public readonly workspaceId: string;
  public readonly profileName: string;

  constructor(profile: EnvProfile, workspaceId: string, isActive: boolean) {
    // Keep active state subtle: no bold label, use icon + description only
    super(profile.name, vscode.TreeItemCollapsibleState.None);

    this.workspaceId = workspaceId;
    this.profileName = profile.name;
    this.contextValue = 'profile';

    const varCount = Object.keys(profile.variables).length;
    this.description = isActive ? `${varCount} vars  ✦` : `${varCount} vars`;

    this.iconPath = new vscode.ThemeIcon(
      isActive ? 'pass-filled' : 'circle-large-outline',
      isActive ? new vscode.ThemeColor('terminal.ansiGreen') : undefined,
    );

    this.tooltip = new vscode.MarkdownString(
      `**${profile.name}**${isActive ? '  ✦ activo' : ''}\n\n` +
        `${varCount} variables · actualizado ${new Date(profile.updatedAt).toLocaleDateString()}`,
    );

    if (!isActive) {
      this.command = {
        command: 'envault.applyProfile',
        title: 'Aplicar',
        arguments: [this],
      };
    }
  }
}

export class EmptyItem extends vscode.TreeItem {
  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'empty';
  }
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class EnvTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<
    vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private showOtherWorkspaces = false;

  constructor(private readonly storage: StorageService) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  toggleOtherWorkspaces(): boolean {
    this.showOtherWorkspaces = !this.showOtherWorkspaces;
    this.refresh();
    return this.showOtherWorkspaces;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      await this.ensureCurrentWorkspace();
      const workspaces = await this.storage.getAllWorkspaces();
      if (workspaces.length === 0) {
        return [new EmptyItem('Abre un workspace para comenzar')];
      }

      const currentId = this.storage.getCurrentWorkspaceId();

      if (!this.showOtherWorkspaces) {
        if (!currentId) {
          return [new EmptyItem('Abre un workspace para comenzar')];
        }
        const current = workspaces.find((ws) => ws.id === currentId);
        if (!current) {
          return [new EmptyItem('Workspace actual no encontrado')];
        }
        return [new WorkspaceItem(current, true)];
      }

      const ordered = [...workspaces].sort((a, b) => {
        if (a.id === currentId) {
          return -1;
        }
        if (b.id === currentId) {
          return 1;
        }
        return a.name.localeCompare(b.name);
      });
      return ordered.map((ws) => new WorkspaceItem(ws, ws.id === currentId));
    }

    if (element instanceof WorkspaceItem) {
      const [profiles, activeProfile] = await Promise.all([
        this.storage.getProfiles(element.workspaceId),
        this.storage.getActiveProfile(element.workspaceId),
      ]);
      if (profiles.length === 0) {
        return [new EmptyItem('Sin perfiles — usa [+] para agregar')];
      }
      return profiles.map(
        (p) =>
          new ProfileItem(p, element.workspaceId, p.name === activeProfile),
      );
    }

    return [];
  }

  private async ensureCurrentWorkspace(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return;
    }
    const folder = folders[0];
    const wsId = this.storage.hashPath(folder.uri.fsPath);
    await this.storage.ensureWorkspace(wsId, folder.name, folder.uri.fsPath);
  }
}
