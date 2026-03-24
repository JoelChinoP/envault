import * as vscode from 'vscode';
import * as crypto  from 'crypto';
import { EnvProfile, WorkspaceMeta } from '../types';

export class StorageService {
  private readonly storageUri: vscode.Uri;

  constructor(context: vscode.ExtensionContext) {
    this.storageUri = context.globalStorageUri;
  }

  // ─── Workspace ────────────────────────────────────────────────────────────

  getCurrentWorkspaceId(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    return this.hashPath(folders[0].uri.fsPath);
  }

  hashPath(p: string): string {
    return crypto.createHash('md5').update(p).digest('hex').substring(0, 12);
  }

  async ensureWorkspace(wsId: string, name: string, fsPath: string): Promise<void> {
    const meta = await this.readJson<WorkspaceMeta>(this.metaPath(wsId));
    if (!meta) {
      await this.writeJson(this.metaPath(wsId), { id: wsId, name, path: fsPath });
    }
  }

  async getAllWorkspaces(): Promise<WorkspaceMeta[]> {
    try {
      const wsDir  = vscode.Uri.joinPath(this.storageUri, 'workspaces');
      const entries = await vscode.workspace.fs.readDirectory(wsDir);
      const metas: WorkspaceMeta[] = [];
      for (const [dirName] of entries) {
        const meta = await this.readJson<WorkspaceMeta>(
          vscode.Uri.joinPath(wsDir, dirName, 'meta.json')
        );
        if (meta) { metas.push(meta); }
      }
      return metas;
    } catch { return []; }
  }

  // ─── Profiles ─────────────────────────────────────────────────────────────

  async getProfiles(wsId: string): Promise<EnvProfile[]> {
    try {
      const dir     = vscode.Uri.joinPath(this.wsDir(wsId), 'profiles');
      const entries = await vscode.workspace.fs.readDirectory(dir);
      const profiles: EnvProfile[] = [];
      for (const [name] of entries) {
        if (!name.endsWith('.json')) { continue; }
        const p = await this.readJson<EnvProfile>(
          vscode.Uri.joinPath(dir, name)
        );
        if (p) { profiles.push(p); }
      }
      return profiles.sort((a, b) => a.name.localeCompare(b.name));
    } catch { return []; }
  }

  async getProfile(wsId: string, profileName: string): Promise<EnvProfile | null> {
    return this.readJson<EnvProfile>(this.profilePath(wsId, profileName));
  }

  async saveProfile(wsId: string, profile: EnvProfile): Promise<void> {
    profile.updatedAt = new Date().toISOString();
    if (!profile.createdAt) { profile.createdAt = profile.updatedAt; }
    await this.writeJson(this.profilePath(wsId, profile.name), profile);
  }

  async deleteProfile(wsId: string, profileName: string): Promise<void> {
    try {
      await vscode.workspace.fs.delete(this.profilePath(wsId, profileName));
      const active = await this.getActiveProfile(wsId);
      if (active === profileName) { await this.setActiveProfile(wsId, null); }
    } catch { /* already gone */ }
  }

  // ─── Active profile ───────────────────────────────────────────────────────

  async getActiveProfile(wsId: string): Promise<string | null> {
    const data = await this.readJson<{ profile: string | null }>(this.activePath(wsId));
    return data?.profile ?? null;
  }

  async setActiveProfile(wsId: string, profileName: string | null): Promise<void> {
    await this.writeJson(this.activePath(wsId), { profile: profileName });
  }

  // ─── Paths ────────────────────────────────────────────────────────────────

  private wsDir(wsId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.storageUri, 'workspaces', wsId);
  }
  private metaPath(wsId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.wsDir(wsId), 'meta.json');
  }
  private activePath(wsId: string): vscode.Uri {
    return vscode.Uri.joinPath(this.wsDir(wsId), 'active.json');
  }
  private profilePath(wsId: string, profileName: string): vscode.Uri {
    return vscode.Uri.joinPath(this.wsDir(wsId), 'profiles', `${profileName}.json`);
  }

  // ─── JSON I/O ─────────────────────────────────────────────────────────────

  private async readJson<T>(uri: vscode.Uri): Promise<T | null> {
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(Buffer.from(raw).toString('utf8')) as T;
    } catch { return null; }
  }

  private async writeJson(uri: vscode.Uri, data: unknown): Promise<void> {
    const encoded = Buffer.from(JSON.stringify(data, null, 2), 'utf8');
    await vscode.workspace.fs.writeFile(uri, encoded);
  }
}
