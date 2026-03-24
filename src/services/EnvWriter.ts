import * as vscode from 'vscode';

export class EnvWriter {
  private static readonly ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

    const lines = [
      '# Generado por Envault — no editar manualmente',
      `# Aplicado: ${new Date().toISOString()}`,
      '',
      ...Object.entries(variables).map(([key, value]) => {
        const safeKey = key.trim();
        if (!EnvWriter.ENV_KEY_REGEX.test(safeKey)) {
          throw new Error(`Clave de variable invalida: ${key}`);
        }
        if (/[\r\n]/.test(value)) {
          throw new Error(
            `El valor de ${safeKey} no puede tener saltos de linea`,
          );
        }
        const needsQuotes =
          value.includes(' ') ||
          value.includes('#') ||
          value.includes('"') ||
          value.includes("'");
        const safeValue = needsQuotes
          ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
          : value;
        return `${safeKey}=${safeValue}`;
      }),
    ];

    await vscode.workspace.fs.writeFile(
      uri,
      Buffer.from(lines.join('\n') + '\n', 'utf8'),
    );
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
    const vars: Record<string, string> = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) {
        continue;
      }
      const key = trimmed.substring(0, eqIdx).trim();
      const raw = trimmed.substring(eqIdx + 1).trim();
      const value = raw.replace(/^(['"])(.*)\1$/, '$2');
      if (key) {
        vars[key] = value;
      }
    }
    return vars;
  }
}
