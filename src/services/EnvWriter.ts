import * as vscode from 'vscode';

export class EnvWriter {
  private getEnvUri(): vscode.Uri | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return null; }
    return vscode.Uri.joinPath(folders[0].uri, '.env');
  }

  /**
   * Writes variables as a .env file in the current workspace root.
   * Values with spaces, # or quotes are double-quoted automatically.
   */
  async write(variables: Record<string, string>): Promise<void> {
    const uri = this.getEnvUri();
    if (!uri) { throw new Error('No hay workspace abierto'); }

    const lines = [
      '# Generado por ENV Manager — no editar manualmente',
      `# Aplicado: ${new Date().toISOString()}`,
      '',
      ...Object.entries(variables).map(([key, value]) => {
        const needsQuotes =
          value.includes(' ') ||
          value.includes('#') ||
          value.includes('"') ||
          value.includes("'");
        const safeValue = needsQuotes
          ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
          : value;
        return `${key}=${safeValue}`;
      }),
    ];

    const content = Buffer.from(lines.join('\n') + '\n', 'utf8');
    await vscode.workspace.fs.writeFile(uri, content);
  }

  /**
   * Reads the current .env from the workspace root.
   * Returns null if it doesn't exist.
   */
  async read(): Promise<string | null> {
    const uri = this.getEnvUri();
    if (!uri) { return null; }

    try {
      const raw = await vscode.workspace.fs.readFile(uri);
      return Buffer.from(raw).toString('utf8');
    } catch {
      return null;
    }
  }

  /**
   * Parses a .env string into a key/value record.
   * Skips blank lines and comments.
   */
  static parse(content: string): Record<string, string> {
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) { continue; }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) { continue; }
      const key   = trimmed.substring(0, eqIdx).trim();
      const raw   = trimmed.substring(eqIdx + 1).trim();
      // Strip surrounding quotes if present
      const value = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) { vars[key] = value; }
    }
    return vars;
  }
}
