import * as vscode from 'vscode';
import { parseEnvContent, serializeEnvContent } from './EnvVariables';

export class EnvWriter {
  private getEnvUri(): vscode.Uri | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return null;
    }
    return vscode.Uri.joinPath(folders[0].uri, '.env');
  }

  async write(variables: Record<string, string>): Promise<void> {
    const uri = this.getEnvUri();
    if (!uri) {
      throw new Error('No hay workspace abierto');
    }

    const content = serializeEnvContent(variables, {
      includeHeader: true,
      appliedAt: new Date().toISOString(),
    });

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
  }

  async read(): Promise<string | null> {
    const uri = this.getEnvUri();
    if (!uri) {
      return null;
    }
    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(raw).toString('utf8');
    } catch {
      return null;
    }
  }

  static parse(content: string): Record<string, string> {
    return parseEnvContent(content);
  }
}
