import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import { EnvTreeProvider } from '../providers/EnvTreeProvider';

type WorkspaceViewCommandDeps = {
  context: vscode.ExtensionContext;
  storage: StorageService;
  treeProvider: EnvTreeProvider;
};

export type WorkspaceViewCommandRegistration = {
  disposables: vscode.Disposable[];
  restoreWorkspaceViewMode: () => Promise<void>;
};

export function registerWorkspaceViewCommands(
  deps: WorkspaceViewCommandDeps,
): WorkspaceViewCommandRegistration {
  const cmd = (id: string, fn: (...args: any[]) => any) =>
    vscode.commands.registerCommand(id, fn);

  const viewModeKeyFor = (wsId: string): string =>
    `envault.view.showOtherWorkspaces:${wsId}`;

  const updateWorkspaceViewContext = async (
    showingAll?: boolean,
  ): Promise<void> => {
    const resolved = showingAll ?? deps.treeProvider.isShowingOtherWorkspaces();
    await vscode.commands.executeCommand(
      'setContext',
      'envault.showOtherWorkspaces',
      resolved,
    );
  };

  const setWorkspaceViewMode = async (showingAll: boolean): Promise<void> => {
    const changed = deps.treeProvider.setShowOtherWorkspaces(showingAll);
    const wsId = deps.storage.getCurrentWorkspaceId();
    if (wsId) {
      await deps.context.workspaceState.update(
        viewModeKeyFor(wsId),
        showingAll,
      );
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
    const wsId = deps.storage.getCurrentWorkspaceId();
    const showingAll = wsId
      ? deps.context.workspaceState.get<boolean>(viewModeKeyFor(wsId), false)
      : false;
    deps.treeProvider.setShowOtherWorkspaces(showingAll);
    await updateWorkspaceViewContext(showingAll);
  };

  return {
    restoreWorkspaceViewMode,
    disposables: [
      cmd('envault.refresh', () => deps.treeProvider.refresh()),
      cmd('envault.toggleOtherWorkspaces', async () => {
        const next = !deps.treeProvider.isShowingOtherWorkspaces();
        await setWorkspaceViewMode(next);
      }),
      cmd('envault.showExpandedWorkspaces', async () => {
        await setWorkspaceViewMode(true);
      }),
      cmd('envault.showFocusedWorkspace', async () => {
        await setWorkspaceViewMode(false);
      }),
    ],
  };
}
