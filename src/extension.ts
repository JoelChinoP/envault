import * as vscode from 'vscode';
import { StorageService } from './storage/StorageService';
import { EnvTreeProvider } from './providers/EnvTreeProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { ProfileEditorPanel } from './ui/ProfileEditorPanel';
import { EnvWriter } from './services/EnvWriter';
import { WorkspaceItem, ProfileItem } from './providers/EnvTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const storage = new StorageService(context);
  const envWriter = new EnvWriter();
  const statusBar = new StatusBarManager(context, storage);
  const treeProvider = new EnvTreeProvider(storage);

  const treeView = vscode.window.createTreeView('envaultTree', {
    treeDataProvider: treeProvider,
    showCollapseAll: false,
  });

  const cmd = (id: string, fn: (...args: any[]) => any) =>
    vscode.commands.registerCommand(id, fn);

  const viewModeKeyFor = (wsId: string): string =>
    `envault.view.showOtherWorkspaces:${wsId}`;

  const updateWorkspaceViewContext = async (
    showingAll?: boolean,
  ): Promise<void> => {
    const resolved = showingAll ?? treeProvider.isShowingOtherWorkspaces();
    await vscode.commands.executeCommand(
      'setContext',
      'envault.showOtherWorkspaces',
      resolved,
    );
  };

  const setWorkspaceViewMode = async (showingAll: boolean): Promise<void> => {
    const changed = treeProvider.setShowOtherWorkspaces(showingAll);
    const wsId = storage.getCurrentWorkspaceId();
    if (wsId) {
      await context.workspaceState.update(viewModeKeyFor(wsId), showingAll);
    }
    await updateWorkspaceViewContext(showingAll);
    if (!changed) {
      return;
    }
    vscode.window.showInformationMessage(
      showingAll
        ? 'Vista ampliada activada: ahora ves todos los workspaces.'
        : 'Vista enfocada activada: mostrando solo el workspace actual.',
    );
  };

  const restoreWorkspaceViewMode = async (): Promise<void> => {
    const wsId = storage.getCurrentWorkspaceId();
    const showingAll = wsId
      ? context.workspaceState.get<boolean>(viewModeKeyFor(wsId), false)
      : false;
    treeProvider.setShowOtherWorkspaces(showingAll);
    await updateWorkspaceViewContext(showingAll);
  };

  void restoreWorkspaceViewMode();

  context.subscriptions.push(
    treeView,

    cmd('envault.refresh', () => treeProvider.refresh()),

    cmd('envault.toggleOtherWorkspaces', async () => {
      const next = !treeProvider.isShowingOtherWorkspaces();
      await setWorkspaceViewMode(next);
    }),
    cmd('envault.showExpandedWorkspaces', async () => {
      await setWorkspaceViewMode(true);
    }),
    cmd('envault.showFocusedWorkspace', async () => {
      await setWorkspaceViewMode(false);
    }),

    cmd('envault.addProfile', (item?: WorkspaceItem) => {
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

    cmd('envault.editProfile', (item: ProfileItem) => {
      ProfileEditorPanel.create(
        context,
        storage,
        item.workspaceId,
        item.profileName,
        () => {
          treeProvider.refresh();
          statusBar.update();
        },
      );
    }),

    cmd('envault.viewProfileReadOnly', (item: ProfileItem) => {
      ProfileEditorPanel.createReadOnly(
        context,
        storage,
        item.workspaceId,
        item.profileName,
      );
    }),

    cmd('envault.deleteProfile', async (item: ProfileItem) => {
      const answer = await vscode.window.showWarningMessage(
        `¿Eliminar el perfil "${item.profileName}"?`,
        { modal: true },
        'Eliminar',
      );
      if (answer !== 'Eliminar') {
        return;
      }
      await storage.deleteProfile(item.workspaceId, item.profileName);
      treeProvider.refresh();
      await statusBar.update();
    }),

    cmd('envault.applyProfile', async (item: ProfileItem) => {
      const currentWsId = storage.getCurrentWorkspaceId();
      if (!currentWsId || item.workspaceId !== currentWsId) {
        vscode.window.showWarningMessage(
          'No puedes aplicar perfiles de otro workspace. Usa vista de solo lectura o cambia al workspace actual.',
        );
        return;
      }

      const profile = await storage.getProfile(
        item.workspaceId,
        item.profileName,
      );
      if (!profile) {
        vscode.window.showErrorMessage(
          `Perfil "${item.profileName}" no encontrado`,
        );
        return;
      }
      try {
        await envWriter.write(profile.variables);
        await storage.setActiveProfile(item.workspaceId, item.profileName);
        treeProvider.refresh();
        await statusBar.update();
        vscode.window.showInformationMessage(
          `✅ Perfil "${item.profileName}" aplicado`,
        );
      } catch (err) {
        vscode.window.showErrorMessage(
          `Error al escribir .env: ${(err as Error).message}`,
        );
      }
    }),

    cmd('envault.importFromEnv', async (item?: WorkspaceItem) => {
      const wsId = item?.workspaceId ?? storage.getCurrentWorkspaceId();
      if (!wsId) {
        vscode.window.showWarningMessage('Abre un workspace primero');
        return;
      }

      const content = await envWriter.read();
      if (!content) {
        vscode.window.showWarningMessage(
          'No se encontró un .env en el workspace actual',
        );
        return;
      }

      const name = await vscode.window.showInputBox({
        title: 'Importar .env como perfil',
        prompt: 'Nombre para el nuevo perfil',
        placeHolder: 'Ej: LOCAL, EMPRESA_A...',
        validateInput: (v) => {
          const normalized = StorageService.normalizeProfileName(v);
          return StorageService.profileNameError(normalized);
        },
      });
      if (!name) {
        return;
      }

      const variables = EnvWriter.parse(content);
      const profileName = StorageService.normalizeProfileName(name);

      await storage.saveProfile(wsId, {
        name: profileName,
        variables,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      treeProvider.refresh();
      vscode.window.showInformationMessage(
        `✅ Perfil "${profileName}" importado con ${Object.keys(variables).length} variables`,
      );
    }),

    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void restoreWorkspaceViewMode();
      treeProvider.refresh();
      statusBar.update();
    }),
  );

  statusBar.update();
}

export function deactivate(): void {}
