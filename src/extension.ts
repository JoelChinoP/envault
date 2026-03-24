import * as vscode from 'vscode';
import { StorageService }   from './storage/StorageService';
import { EnvTreeProvider }  from './providers/EnvTreeProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { ProfileEditorPanel } from './ui/ProfileEditorPanel';
import { EnvWriter }        from './services/EnvWriter';
import { WorkspaceItem, ProfileItem } from './providers/EnvTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const storage    = new StorageService(context);
  const envWriter  = new EnvWriter();
  const statusBar  = new StatusBarManager(context, storage);
  const treeProvider = new EnvTreeProvider(storage);

  const treeView = vscode.window.createTreeView('envManagerTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  // ── Commands ───────────────────────────────────────────────────────────────

  const cmd = (id: string, fn: (...args: any[]) => any) =>
    vscode.commands.registerCommand(id, fn);

  context.subscriptions.push(
    treeView,

    // Refresh tree
    cmd('envManager.refresh', () => treeProvider.refresh()),

    // New profile — can be called from the toolbar (+) or from a workspace item context menu
    cmd('envManager.addProfile', (item?: WorkspaceItem) => {
      const wsId = item?.workspaceId ?? storage.getCurrentWorkspaceId();
      if (!wsId) {
        vscode.window.showWarningMessage('Abre un workspace primero');
        return;
      }
      ProfileEditorPanel.create(context, storage, wsId, null, () => {
        treeProvider.refresh();
        statusBar.update();
      });
    }),

    // Edit existing profile
    cmd('envManager.editProfile', (item: ProfileItem) => {
      ProfileEditorPanel.create(context, storage, item.workspaceId, item.profileName, () => {
        treeProvider.refresh();
        statusBar.update();
      });
    }),

    // Delete profile (with confirmation)
    cmd('envManager.deleteProfile', async (item: ProfileItem) => {
      const answer = await vscode.window.showWarningMessage(
        `¿Eliminar el perfil "${item.profileName}"?`,
        { modal: true },
        'Eliminar'
      );
      if (answer !== 'Eliminar') { return; }

      await storage.deleteProfile(item.workspaceId, item.profileName);
      treeProvider.refresh();
      await statusBar.update();
    }),

    // Apply profile → write .env
    cmd('envManager.applyProfile', async (item: ProfileItem) => {
      const profile = await storage.getProfile(item.workspaceId, item.profileName);
      if (!profile) {
        vscode.window.showErrorMessage(`Perfil "${item.profileName}" no encontrado`);
        return;
      }

      try {
        await envWriter.write(profile.variables);
        await storage.setActiveProfile(item.workspaceId, item.profileName);
        treeProvider.refresh();
        await statusBar.update();
        vscode.window.showInformationMessage(`✅ Perfil "${item.profileName}" aplicado`);
      } catch (err) {
        vscode.window.showErrorMessage(`Error al escribir .env: ${(err as Error).message}`);
      }
    }),

    // Import current .env as a new profile
    cmd('envManager.importFromEnv', async (item?: WorkspaceItem) => {
      const wsId = item?.workspaceId ?? storage.getCurrentWorkspaceId();
      if (!wsId) {
        vscode.window.showWarningMessage('Abre un workspace primero');
        return;
      }

      const content = await envWriter.read();
      if (!content) {
        vscode.window.showWarningMessage('No se encontró un .env en el workspace actual');
        return;
      }

      const name = await vscode.window.showInputBox({
        title: 'Importar .env como perfil',
        prompt: 'Nombre para el nuevo perfil',
        placeHolder: 'Ej: MINCOR, EMPRESA_B, PRODUCCION...',
        validateInput: (v) => v.trim() ? null : 'El nombre no puede estar vacío',
      });
      if (!name) { return; }

      const variables  = EnvWriter.parse(content);
      const varCount   = Object.keys(variables).length;
      const profileName = name.trim().toUpperCase().replace(/\s+/g, '_');

      await storage.saveProfile(wsId, {
        name: profileName,
        variables,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      treeProvider.refresh();
      vscode.window.showInformationMessage(
        `✅ Perfil "${profileName}" importado con ${varCount} variables`
      );
    })
  );

  // ── Refresh status bar when workspace changes ──────────────────────────────
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      treeProvider.refresh();
      statusBar.update();
    })
  );

  // Initial status bar update
  statusBar.update();
}

export function deactivate(): void { /* nothing to clean up */ }
