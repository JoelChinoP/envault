import * as vscode from 'vscode';
import { StorageService } from '../storage/StorageService';
import { EnvWriter }      from '../services/EnvWriter';
import { EnvProfile }     from '../types';

export class ProfileEditorPanel {
  private static readonly openPanels = new Map<string, ProfileEditorPanel>();
  private readonly panel: vscode.WebviewPanel;

  private constructor(
    context: vscode.ExtensionContext,
    private readonly storage: StorageService,
    private readonly workspaceId: string,
    private readonly profileName: string | null,
    private readonly onSaved: () => void
  ) {
    const title = profileName ? `Editar: ${profileName}` : 'Nuevo Perfil';

    this.panel = vscode.window.createWebviewPanel(
      'envProfileEditor',
      title,
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true }
    );

    this.panel.webview.onDidReceiveMessage(async (msg) => {
      switch (msg.command) {
        case 'save':     await this.handleSave(msg.profile); break;
        case 'cancel':   this.panel.dispose();               break;
        case 'pickFile': await this.handlePickFile();        break;
      }
    });

    this.panel.onDidDispose(() => {
      ProfileEditorPanel.openPanels.delete(this.panelKey());
    });

    this.render();
  }

  // ─── Public factory ───────────────────────────────────────────────────────

  static create(
    context: vscode.ExtensionContext,
    storage: StorageService,
    workspaceId: string,
    profileName: string | null,
    onSaved: () => void
  ): void {
    const key = workspaceId + ':' + (profileName ?? '__new__');
    if (ProfileEditorPanel.openPanels.has(key)) {
      ProfileEditorPanel.openPanels.get(key)!.panel.reveal();
      return;
    }
    const instance = new ProfileEditorPanel(context, storage, workspaceId, profileName, onSaved);
    ProfileEditorPanel.openPanels.set(key, instance);
  }

  // ─── Message handlers ─────────────────────────────────────────────────────

  private panelKey(): string {
    return this.workspaceId + ':' + (this.profileName ?? '__new__');
  }

  private async render(): Promise<void> {
    let profile: EnvProfile | null = null;
    if (this.profileName) {
      profile = await this.storage.getProfile(this.workspaceId, this.profileName);
    }
    this.panel.webview.html = this.buildHtml(profile);
  }

  private async handleSave(data: { name: string; variables: Record<string, string> }): Promise<void> {
    const name = data.name.trim().toUpperCase().replace(/\s+/g, '_');
    if (!name) {
      vscode.window.showErrorMessage('El nombre del perfil no puede estar vacío');
      return;
    }
    const existing = this.profileName
      ? await this.storage.getProfile(this.workspaceId, this.profileName)
      : null;

    const profile: EnvProfile = {
      name,
      variables: data.variables,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await this.storage.saveProfile(this.workspaceId, profile);
    this.onSaved();
    this.panel.dispose();
    vscode.window.showInformationMessage(`✅ Perfil "${name}" guardado`);
  }

  /**
   * Opens a native OS file picker, reads the chosen file,
   * parses it with EnvWriter.parse and sends variables back to the webview.
   */
  private async handlePickFile(): Promise<void> {
    const uris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Importar',
      filters: { 'Env files': ['env', 'txt', '*'] },
      title: 'Selecciona un archivo .env para importar',
    });

    if (!uris || uris.length === 0) { return; }

    try {
      const raw  = await vscode.workspace.fs.readFile(uris[0]);
      const text = Buffer.from(raw).toString('utf8');
      const vars = EnvWriter.parse(text);
      // Send back to webview — it loads vars into whichever mode is active
      this.panel.webview.postMessage({ command: 'fileImported', variables: vars });
    } catch (err) {
      vscode.window.showErrorMessage(`No se pudo leer el archivo: ${(err as Error).message}`);
    }
  }

  // ─── HTML ─────────────────────────────────────────────────────────────────

  private buildHtml(profile: EnvProfile | null): string {
    const name     = profile?.name ?? '';
    const varsJson = JSON.stringify(profile?.variables ?? {});
    const isNew    = !profile;

    return /* html */`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ENV Profile Editor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 24px 28px;
    max-width: 740px;
  }

  /* ── Header ── */
  .header { display: flex; align-items: center; gap: 10px; margin-bottom: 22px; }
  .header h2 { font-size: 15px; font-weight: 600; flex: 1; }
  .badge {
    font-size: 10px; padding: 2px 8px; border-radius: 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  /* ── Name field ── */
  .field { margin-bottom: 16px; }
  label {
    display: block; margin-bottom: 5px;
    font-size: 11px; text-transform: uppercase;
    letter-spacing: 0.6px; color: var(--vscode-descriptionForeground);
  }
  input[type="text"] {
    width: 100%; padding: 6px 9px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px; outline: none; transition: border-color 0.1s;
  }
  input:focus { border-color: var(--vscode-focusBorder); }

  .divider { height: 1px; background: var(--vscode-panel-border); margin: 18px 0; }

  /* ── Toolbar ── */
  .toolbar {
    display: flex; align-items: center;
    justify-content: space-between;
    margin-bottom: 10px; gap: 8px;
  }
  .toolbar-left { display: flex; align-items: center; gap: 8px; }

  .btn-import {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 4px 10px; background: none;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px; color: var(--vscode-editor-foreground);
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; transition: border-color 0.1s, background 0.1s;
  }
  .btn-import:hover {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-toolbar-hoverBackground);
  }

  /* ── Visual / Raw toggle ── */
  .toggle {
    display: flex;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px; overflow: hidden;
  }
  .toggle button {
    padding: 4px 12px; background: none; border: none;
    color: var(--vscode-descriptionForeground);
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; transition: background 0.1s, color 0.1s;
  }
  .toggle button.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .toggle button:not(.active):hover {
    background: var(--vscode-toolbar-hoverBackground);
    color: var(--vscode-editor-foreground);
  }

  /* ── Visual editor ── */
  .col-header {
    display: grid; grid-template-columns: 1fr 1fr 26px;
    gap: 6px; margin-bottom: 5px; padding: 0 2px;
  }
  .col-header span {
    font-size: 10px; text-transform: uppercase;
    letter-spacing: 0.5px; color: var(--vscode-descriptionForeground);
  }
  #varList { display: flex; flex-direction: column; gap: 5px; }
  .var-row {
    display: grid; grid-template-columns: 1fr 1fr 26px;
    gap: 6px; align-items: center;
  }
  .btn-icon {
    display: flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; background: none; border: none;
    border-radius: 3px; cursor: pointer;
    color: var(--vscode-icon-foreground);
    font-size: 17px; line-height: 1; opacity: 0.55;
    transition: opacity 0.1s, background 0.1s;
  }
  .btn-icon:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  .btn-icon.danger:hover { color: var(--vscode-errorForeground); }
  .btn-add {
    margin-top: 8px; width: 100%; padding: 5px; background: none;
    border: 1px dashed var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px; color: var(--vscode-descriptionForeground);
    cursor: pointer; font-size: 12px; font-family: var(--vscode-font-family);
    transition: border-color 0.1s, color 0.1s;
  }
  .btn-add:hover {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-editor-foreground);
  }

  /* ── Raw editor ── */
  #rawEditor {
    width: 100%; min-height: 300px; padding: 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px; line-height: 1.7; resize: vertical; outline: none;
  }
  #rawEditor:focus { border-color: var(--vscode-focusBorder); }
  .raw-hint {
    margin-top: 5px; font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  /* ── Actions ── */
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 26px; }
  button.primary, button.secondary {
    padding: 6px 18px; border: none; border-radius: 3px;
    cursor: pointer; font-size: 13px; font-family: var(--vscode-font-family);
  }
  button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  button.primary:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
</style>
</head>
<body>

<div class="header">
  <h2>${isNew ? '➕ Nuevo Perfil' : '✏️ Editar Perfil'}</h2>
  <span class="badge" id="varCounter">0 vars</span>
</div>

<div class="field">
  <label>Nombre del Perfil</label>
  <input id="profileName" type="text"
    value="${this.escHtml(name)}"
    placeholder="Ej: MINCOR, EMPRESA_B, PRODUCCION...">
</div>

<div class="divider"></div>

<div class="toolbar">
  <div class="toolbar-left">
    <label style="margin:0">Variables</label>
    <button class="btn-import" onclick="pickFile()" title="Importar desde archivo .env">
      📂 Importar archivo
    </button>
  </div>
  <div class="toggle">
    <button id="btnVisual" class="active" onclick="setMode('visual')">⊞ Visual</button>
    <button id="btnRaw"                   onclick="setMode('raw')">✎ Archivo</button>
  </div>
</div>

<!-- Visual mode -->
<div id="visualMode">
  <div class="col-header">
    <span>Clave</span><span>Valor</span><span></span>
  </div>
  <div id="varList"></div>
  <button class="btn-add" onclick="addRow()">＋ Agregar variable</button>
</div>

<!-- Raw mode -->
<div id="rawMode" style="display:none">
  <textarea id="rawEditor" spellcheck="false"
    placeholder="DB_HOST=localhost&#10;DB_PORT=3306&#10;APP_KEY=base64:...&#10;&#10;# Los comentarios se ignoran al guardar"></textarea>
  <div class="raw-hint">💡 Puedes pegar el contenido completo de un .env aquí. Los comentarios se omiten al guardar.</div>
</div>

<div class="actions">
  <button class="secondary" onclick="cancel()">Cancelar</button>
  <button class="primary"   onclick="save()">Guardar perfil</button>
</div>

<script>
  const vscode      = acquireVsCodeApi();
  const initialVars = ${varsJson};
  let   mode        = 'visual';  // 'visual' | 'raw'

  // ── Init ──────────────────────────────────────────────────────────────────
  function init() {
    const entries = Object.entries(initialVars);
    if (entries.length === 0) { addRow(); }
    else { entries.forEach(([k, v]) => addRowWith(k, v)); }
    updateCounter();
  }

  // ── Mode toggle ───────────────────────────────────────────────────────────
  function setMode(next) {
    if (next === mode) { return; }

    if (next === 'raw') {
      // visual → raw: serialize rows into text
      document.getElementById('rawEditor').value = toRaw(collectVars());
      document.getElementById('visualMode').style.display = 'none';
      document.getElementById('rawMode').style.display    = 'block';
      document.getElementById('btnVisual').classList.remove('active');
      document.getElementById('btnRaw').classList.add('active');
    } else {
      // raw → visual: parse textarea and rebuild rows
      const vars = parseRaw(document.getElementById('rawEditor').value);
      clearRows();
      const entries = Object.entries(vars);
      if (entries.length === 0) { addRow(); }
      else { entries.forEach(([k, v]) => addRowWith(k, v)); }
      updateCounter();
      document.getElementById('rawMode').style.display    = 'none';
      document.getElementById('visualMode').style.display = 'block';
      document.getElementById('btnRaw').classList.remove('active');
      document.getElementById('btnVisual').classList.add('active');
    }
    mode = next;
  }

  // ── File import ───────────────────────────────────────────────────────────
  function pickFile() {
    vscode.postMessage({ command: 'pickFile' });
  }

  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.command !== 'fileImported') { return; }
    loadVars(msg.variables);
  });

  function loadVars(vars) {
    if (mode === 'visual') {
      clearRows();
      const entries = Object.entries(vars);
      if (entries.length === 0) { addRow(); }
      else { entries.forEach(([k, v]) => addRowWith(k, v)); }
      updateCounter();
    } else {
      document.getElementById('rawEditor').value = toRaw(vars);
      updateCounter();
    }
  }

  // ── Visual editor ─────────────────────────────────────────────────────────
  function addRow() {
    addRowWith('', '');
    updateCounter();
    const rows = document.querySelectorAll('.var-row');
    rows[rows.length - 1].querySelector('.var-key').focus();
  }

  function addRowWith(key, value) {
    const list = document.getElementById('varList');
    const row  = document.createElement('div');
    row.className = 'var-row';
    row.innerHTML =
      '<input type="text" class="var-key"   value="' + esc(key)   + '" placeholder="DB_HOST">' +
      '<input type="text" class="var-value" value="' + esc(value) + '" placeholder="valor">' +
      '<button class="btn-icon danger" onclick="removeRow(this)" title="Eliminar">×</button>';
    list.appendChild(row);
    row.querySelector('.var-key').addEventListener('input', updateCounter);
  }

  function clearRows() {
    document.getElementById('varList').innerHTML = '';
  }

  function removeRow(btn) {
    btn.closest('.var-row').remove();
    updateCounter();
  }

  function collectVars() {
    const result = {};
    document.querySelectorAll('.var-row').forEach(row => {
      const k = row.querySelector('.var-key').value.trim();
      const v = row.querySelector('.var-value').value;
      if (k) { result[k] = v; }
    });
    return result;
  }

  function updateCounter() {
    const count = mode === 'visual'
      ? Object.keys(collectVars()).length
      : Object.keys(parseRaw(document.getElementById('rawEditor').value)).length;
    document.getElementById('varCounter').textContent = count + ' vars';
  }

  // ── Raw helpers ───────────────────────────────────────────────────────────
  function parseRaw(text) {
    const result = {};
    for (const line of text.split('\\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) { continue; }
      const idx = t.indexOf('=');
      if (idx === -1) { continue; }
      const k = t.substring(0, idx).trim();
      const r = t.substring(idx + 1).trim();
      const v = r.replace(/^(['"])(.*?)\\1$/, '$2');
      if (k) { result[k] = v; }
    }
    return result;
  }

  function toRaw(vars) {
    return Object.entries(vars).map(([k, v]) => k + '=' + v).join('\\n');
  }

  // ── Save / cancel ─────────────────────────────────────────────────────────
  function save() {
    const name      = document.getElementById('profileName').value.trim();
    const variables = mode === 'visual'
      ? collectVars()
      : parseRaw(document.getElementById('rawEditor').value);
    vscode.postMessage({ command: 'save', profile: { name, variables } });
  }

  function cancel() {
    vscode.postMessage({ command: 'cancel' });
  }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  document.getElementById('rawEditor').addEventListener('input', () => {
    if (mode === 'raw') { updateCounter(); }
  });

  init();
</script>
</body>
</html>`;
  }

  private escHtml(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
