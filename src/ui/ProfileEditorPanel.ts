import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import {
  parseEnvContent,
  sanitizeEnvVariables,
} from '../services/EnvVariables';
import { EnvProfile } from '../types';
import { buildProfileEditorHtml } from './ProfileEditorTemplate';

type SaveMessage = {
  command: 'save';
  profile: {
    name: string;
    variables: Record<string, string>;
  };
};

type CancelMessage = { command: 'cancel' };
type PickFileMessage = { command: 'pickFile' };
type IncomingMessage = SaveMessage | CancelMessage | PickFileMessage;

export class ProfileEditorPanel {
  private static readonly openPanels = new Map<string, ProfileEditorPanel>();
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly storage: StorageService,
    private readonly workspaceId: string,
    private readonly profileName: string | null,
    private readonly onSaved: () => void,
    private readonly readOnly: boolean,
  ) {
    const title = readOnly
      ? `Vista: ${profileName ?? 'Perfil'}`
      : profileName
        ? `Editar: ${profileName}`
        : 'Nuevo Perfil';

    this.panel = vscode.window.createWebviewPanel(
      'envaultEditor',
      title,
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    this.panel.webview.onDidReceiveMessage(async (rawMsg: unknown) => {
      const msg = this.parseIncomingMessage(rawMsg);
      if (!msg) {
        vscode.window.showWarningMessage(
          'Mensaje invalido del editor de perfiles',
        );
        return;
      }

      switch (msg.command) {
        case 'save':
          if (this.readOnly) {
            return;
          }
          await this.handleSave(msg.profile);
          break;
        case 'cancel':
          this.panel.dispose();
          break;
        case 'pickFile':
          if (this.readOnly) {
            return;
          }
          await this.handlePickFile();
          break;
      }
    });

    this.panel.onDidDispose(() => {
      ProfileEditorPanel.openPanels.delete(this.panelKey());
    });

    this.render();
  }

  static create(
    context: vscode.ExtensionContext,
    storage: StorageService,
    workspaceId: string,
    profileName: string | null,
    onSaved: () => void,
  ): void {
    const key = `${workspaceId}:${profileName ?? '__new__'}:__editable__`;
    if (ProfileEditorPanel.openPanels.has(key)) {
      ProfileEditorPanel.openPanels.get(key)!.panel.reveal();
      return;
    }
    ProfileEditorPanel.openPanels.set(
      key,
      new ProfileEditorPanel(
        context,
        storage,
        workspaceId,
        profileName,
        onSaved,
        false,
      ),
    );
  }

  static createReadOnly(
    context: vscode.ExtensionContext,
    storage: StorageService,
    workspaceId: string,
    profileName: string,
  ): void {
    const key = `${workspaceId}:${profileName}:__readonly__`;
    if (ProfileEditorPanel.openPanels.has(key)) {
      ProfileEditorPanel.openPanels.get(key)!.panel.reveal();
      return;
    }
    ProfileEditorPanel.openPanels.set(
      key,
      new ProfileEditorPanel(
        context,
        storage,
        workspaceId,
        profileName,
        () => {},
        true,
      ),
    );
  }

  private panelKey(): string {
    const mode = this.readOnly ? '__readonly__' : '__editable__';
    return `${this.workspaceId}:${this.profileName ?? '__new__'}:${mode}`;
  }

  private async render(): Promise<void> {
    let profile: EnvProfile | null = null;
    if (this.profileName) {
      profile = await this.storage.getProfile(
        this.workspaceId,
        this.profileName,
      );
    }
    this.panel.webview.html = buildProfileEditorHtml({
      webview: this.panel.webview,
      profile,
      readOnly: this.readOnly,
    });
  }

  private async handleSave(data: {
    name: string;
    variables: Record<string, string>;
  }): Promise<void> {
    const name = StorageService.normalizeProfileName(data.name);
    const nameError = StorageService.profileNameError(name);
    if (nameError) {
      vscode.window.showErrorMessage(nameError);
      return;
    }

    let safeVariables: Record<string, string>;
    try {
      safeVariables = this.sanitizeVariables(data.variables);
    } catch (err) {
      vscode.window.showErrorMessage((err as Error).message);
      return;
    }

    const existing = this.profileName
      ? await this.storage.getProfile(this.workspaceId, this.profileName)
      : null;

    await this.storage.saveProfile(this.workspaceId, {
      name,
      variables: safeVariables,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    this.onSaved();
    this.panel.dispose();
    vscode.window.showInformationMessage(`✅ Perfil "${name}" guardado`);
  }

  private async handlePickFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Importar',
      filters: { 'Env files': ['env', 'txt', '*'] },
      title: 'Selecciona un archivo .env para importar',
    });
    if (!uris || uris.length === 0) {
      return;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uris[0]);
      const vars = parseEnvContent(Buffer.from(raw).toString('utf8'));
      this.panel.webview.postMessage({
        command: 'fileImported',
        variables: vars,
      });
    } catch (err) {
      vscode.window.showErrorMessage(
        `No se pudo leer el archivo: ${(err as Error).message}`,
      );
    }
  }

  private parseIncomingMessage(rawMsg: unknown): IncomingMessage | null {
    if (!this.isRecord(rawMsg) || typeof rawMsg.command !== 'string') {
      return null;
    }

    if (rawMsg.command === 'cancel') {
      return { command: 'cancel' };
    }
    if (rawMsg.command === 'pickFile') {
      return { command: 'pickFile' };
    }
    if (rawMsg.command !== 'save' || !this.isRecord(rawMsg.profile)) {
      return null;
    }

    const { name, variables } = rawMsg.profile;
    if (typeof name !== 'string' || !this.isRecord(variables)) {
      return null;
    }

    const normalizedVariables: Record<string, string> = {};
    for (const [k, v] of Object.entries(variables)) {
      if (typeof v !== 'string') {
        return null;
      }
      normalizedVariables[k] = v;
    }

    return {
      command: 'save',
      profile: {
        name,
        variables: normalizedVariables,
      },
    };
  }

  private sanitizeVariables(
    input: Record<string, string>,
  ): Record<string, string> {
    return sanitizeEnvVariables(input);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
