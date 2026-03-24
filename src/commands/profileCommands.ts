import * as vscode from 'vscode';
import { WorkspaceItem, ProfileItem } from '../providers/EnvTreeProvider';
import { StorageService } from '../storage/StorageService';
import { EnvTreeProvider } from '../providers/EnvTreeProvider';
import { StatusBarManager } from '../ui/StatusBarManager';
import { EnvWriter } from '../services/EnvWriter';
import { sanitizeEnvVariables } from '../services/EnvVariables';
import { ProfileEditorPanel } from '../ui/ProfileEditorPanel';

type ProfileCommandDeps = {
  context: vscode.ExtensionContext;
  storage: StorageService;
  treeProvider: EnvTreeProvider;
  statusBar: StatusBarManager;
  envWriter: EnvWriter;
};

export function registerProfileCommands(
  deps: ProfileCommandDeps,
): vscode.Disposable[] {
  const cmd = (id: string, fn: (...args: any[]) => any) =>
    vscode.commands.registerCommand(id, fn);

  const onProfileUpdated = () => {
    deps.treeProvider.refresh();
    void deps.statusBar.update();
  };

  return [
    cmd('envault.addProfile', (item?: WorkspaceItem) => {
      const wsId = item?.workspaceId ?? deps.storage.getCurrentWorkspaceId();
      if (!wsId) {
        vscode.window.showWarningMessage('Abre un workspace primero');
        return;
      }
      ProfileEditorPanel.create(
        deps.context,
        deps.storage,
        wsId,
        null,
        onProfileUpdated,
      );
    }),

    cmd('envault.editProfile', (item: ProfileItem) => {
      ProfileEditorPanel.create(
        deps.context,
        deps.storage,
        item.workspaceId,
        item.profileName,
        onProfileUpdated,
      );
    }),

    cmd('envault.viewProfileReadOnly', (item: ProfileItem) => {
      ProfileEditorPanel.createReadOnly(
        deps.context,
        deps.storage,
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
      await deps.storage.deleteProfile(item.workspaceId, item.profileName);
      deps.treeProvider.refresh();
      await deps.statusBar.update();
    }),

    cmd('envault.applyProfile', async (item: ProfileItem) => {
      const currentWsId = deps.storage.getCurrentWorkspaceId();
      if (!currentWsId || item.workspaceId !== currentWsId) {
        vscode.window.showWarningMessage(
          'No puedes aplicar perfiles de otro workspace. Usa vista de solo lectura o cambia al workspace actual.',
        );
        return;
      }

      const profile = await deps.storage.getProfile(
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
        await deps.envWriter.write(profile.variables);
        await deps.storage.setActiveProfile(item.workspaceId, item.profileName);
        deps.treeProvider.refresh();
        await deps.statusBar.update();
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
      const wsId = item?.workspaceId ?? deps.storage.getCurrentWorkspaceId();
      if (!wsId) {
        vscode.window.showWarningMessage('Abre un workspace primero');
        return;
      }

      const content = await deps.envWriter.read();
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

      let variables: Record<string, string>;
      try {
        variables = sanitizeEnvVariables(EnvWriter.parse(content));
      } catch (err) {
        vscode.window.showErrorMessage(
          `No se pudo importar el .env: ${(err as Error).message}`,
        );
        return;
      }
      const profileName = StorageService.normalizeProfileName(name);

      await deps.storage.saveProfile(wsId, {
        name: profileName,
        variables,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      deps.treeProvider.refresh();
      vscode.window.showInformationMessage(
        `✅ Perfil "${profileName}" importado con ${Object.keys(variables).length} variables`,
      );
    }),
  ];
}
