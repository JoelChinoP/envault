import * as vscode from 'vscode';
import { EnvProfile } from '../types';

export function buildProfileEditorHtml(options: {
  webview: vscode.Webview;
  profile: EnvProfile | null;
  readOnly: boolean;
}): string {
  const { webview, profile, readOnly } = options;
  const nonce = createNonce();
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const name = profile?.name ?? '';
  const varsB64 = Buffer.from(
    JSON.stringify(profile?.variables ?? {}),
    'utf8',
  ).toString('base64');
  const isNew = !profile;

  return /* html */ `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Envault Editor</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--vscode-font-family);
    font-size: 13px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    padding: 22px 28px 28px;
    max-width: 800px;

    width: 100%;
    margin: 0 auto;
  }

  /* -- Header -- */
  .header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; }
  .header h2 { font-size: 15px; font-weight: 600; flex: 1; }
  .badge {
    font-size: 10px; padding: 2px 8px; border-radius: 10px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  /* -- Name field -- */
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
    font-size: 13px; outline: none; transition: border-color 0.15s;
  }
  input:focus { border-color: var(--vscode-focusBorder); }

  .divider { height: 1px; background: var(--vscode-panel-border); margin: 16px 0; }

  /* -- Toolbar -- */
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
    cursor: pointer; transition: border-color 0.12s, background 0.12s;
  }
  .btn-import:hover {
    border-color: var(--vscode-focusBorder);
    background: var(--vscode-toolbar-hoverBackground);
  }

  /* -- Mode toggle -- */
  .toggle {
    display: flex;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px; overflow: hidden;
  }
  .toggle button {
    padding: 4px 12px; background: none; border: none;
    color: var(--vscode-descriptionForeground);
    font-size: 12px; font-family: var(--vscode-font-family);
    cursor: pointer; transition: background 0.12s, color 0.12s;
  }
  .toggle button.active {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
  .toggle button:not(.active):hover {
    background: var(--vscode-toolbar-hoverBackground);
    color: var(--vscode-editor-foreground);
  }

  /* ===============================================
     RAW MODE  - textarea + highlight overlay
  =============================================== */

  .raw-wrap {
    position: relative;
    height: 70vh;
    border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.35));
    border-radius: 3px;
    overflow: hidden;
  }
  .raw-wrap:focus-within {
    border-color: var(--vscode-focusBorder);
  }

  /* Highlight layer - sits behind, painted by JS */
  #rawHL {
    position: absolute; inset: 0;
    padding: 10px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px; line-height: 1.7;
    white-space: pre-wrap; word-break: break-all;
    pointer-events: none;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    overflow: hidden;
    border-radius: 3px;
    /* Text is visible through transparent textarea */
  }

  /* Actual textarea - transparent text so highlight shows through */
  #rawEditor {
    position: absolute; inset: 0;
    padding: 10px 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 13px; line-height: 1.7;
    white-space: pre-wrap; word-break: break-all;
    background: transparent;
    color: transparent;
    caret-color: var(--vscode-editor-foreground);
    border: none; outline: none; resize: none;
    width: 100%; height: 100%;
    z-index: 1;
    overflow-y: auto;
    tab-size: 2;
  }
  /* selection must be visible */
  #rawEditor::selection { background: var(--vscode-editor-selectionBackground); }

  /* -- Syntax token colors -- */
  .t-key     { color: var(--vscode-textLink-foreground); }
  .t-eq      { color: var(--vscode-descriptionForeground); }
  .t-val     { color: var(--vscode-editor-foreground); }
  .t-comment { color: var(--vscode-descriptionForeground); font-style: italic; opacity: 0.6; }
  .t-empty   { color: transparent; }  /* keeps line height */

  .raw-hint {
    margin-top: 5px; font-size: 11px;
    color: var(--vscode-descriptionForeground);
  }

  /* ===============================================
     VISUAL MODE
  =============================================== */

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
    transition: border-color 0.12s, color 0.12s;
  }
  .btn-add:hover {
    border-color: var(--vscode-focusBorder);
    color: var(--vscode-editor-foreground);
  }

  /* -- Actions -- */
  .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 22px; }
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
<body data-initial-vars="${varsB64}" data-readonly="${readOnly ? '1' : '0'}">

<div class="header">
  <h2>${readOnly ? '👁️ Vista de solo lectura' : isNew ? '➕ Nuevo Perfil' : '✏️ Editar Perfil'}</h2>
  <span class="badge" id="varCounter">0 vars</span>
</div>

<div class="field">
  <label>Nombre del Perfil</label>
  <input id="profileName" type="text"
    value="${escHtml(name)}"
    placeholder="Ej: LOCAL, EMPRESA_A, PRODUCCION...">
</div>

<div class="divider"></div>

<div class="toolbar">
  <div class="toolbar-left">
    <label style="margin:0">Variables</label>
    <button id="btnImportFile" class="btn-import">📂 Importar archivo</button>
  </div>
  <div class="toggle">
    <button id="btnRaw" class="active">✎ Archivo</button>
    <button id="btnVisual">⊞ Visual</button>
  </div>
</div>

<!-- RAW MODE (default) -->
<div id="rawMode">
  <div class="raw-wrap">
    <pre id="rawHL" aria-hidden="true"></pre>
    <textarea id="rawEditor" spellcheck="false"
      placeholder="DB_HOST=localhost&#10;DB_PORT=3306&#10;APP_KEY=base64:...&#10;&#10;# Los comentarios se ignoran al guardar"></textarea>
  </div>
  <div class="raw-hint">💡 Los comentarios (#) se omiten al guardar. Puedes pegar el contenido completo de un .env aquí.</div>
</div>

<!-- VISUAL MODE -->
<div id="visualMode" style="display:none">
  <div class="col-header">
    <span>Clave</span><span>Valor</span><span></span>
  </div>
  <div id="varList"></div>
  <button id="btnAddVar" class="btn-add">＋ Agregar variable</button>
</div>

<div class="actions">
  <button id="btnCancel" class="secondary">Cancelar</button>
  <button id="btnSave" class="primary">Guardar perfil</button>
</div>

<script nonce="${nonce}">
  const vscode      = acquireVsCodeApi();
  const readOnly    = document.body.dataset.readonly === '1';
  const initialVars = (() => {
    try {
      const b64 = document.body.dataset.initialVars || '';
      if (!b64) { return {}; }
      const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
      const decoded = new TextDecoder().decode(bytes);
      const parsed = JSON.parse(decoded);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch {
      return {};
    }
  })();
  let   mode        = 'raw';

  // -- Init ---------------------------------------------------------------
  function init() {
    wireEvents();
    applyReadOnlyMode();
    // Load into raw textarea as initial default
    const rawText = toRaw(initialVars);
    document.getElementById('rawEditor').value = rawText;
    syncHighlight(rawText);
    updateCounter();
  }

  function wireEvents() {
    if (!readOnly) {
      document.getElementById('btnImportFile').addEventListener('click', pickFile);
      document.getElementById('btnAddVar').addEventListener('click', addRow);
      document.getElementById('btnSave').addEventListener('click', save);
    }
    document.getElementById('btnRaw').addEventListener('click', () => setMode('raw'));
    document.getElementById('btnVisual').addEventListener('click', () => setMode('visual'));
    document.getElementById('btnCancel').addEventListener('click', cancel);
  }

  function applyReadOnlyMode() {
    if (!readOnly) { return; }
    const nameInput = document.getElementById('profileName');
    const rawEditor = document.getElementById('rawEditor');
    const importBtn = document.getElementById('btnImportFile');
    const addBtn = document.getElementById('btnAddVar');
    const saveBtn = document.getElementById('btnSave');
    const cancelBtn = document.getElementById('btnCancel');

    nameInput.setAttribute('readonly', 'true');
    rawEditor.setAttribute('readonly', 'true');
    importBtn.style.display = 'none';
    addBtn.style.display = 'none';
    saveBtn.style.display = 'none';
    cancelBtn.textContent = 'Cerrar';
  }

  // -- Highlight ----------------------------------------------------------
  function syncHighlight(text) {
    const hl = document.getElementById('rawHL');
    hl.innerHTML = text.split('\\n').map(highlightLine).join('\\n') + '\\n';
  }

  function highlightLine(line) {
    if (line === '') { return '<span class="t-empty"> </span>'; }
    const t = line.trimStart();
    if (t.startsWith('#')) {
      return '<span class="t-comment">' + esc(line) + '</span>';
    }
    const idx = line.indexOf('=');
    if (idx > 0) {
      const key = line.substring(0, idx);
      const val = line.substring(idx + 1);
      return '<span class="t-key">' + esc(key) + '</span>' +
             '<span class="t-eq">=</span>' +
             '<span class="t-val">' + esc(val) + '</span>';
    }
    return esc(line);
  }

  // Sync scroll between textarea and highlight layer
  document.getElementById('rawEditor').addEventListener('scroll', function() {
    document.getElementById('rawHL').scrollTop = this.scrollTop;
  });

  document.getElementById('rawEditor').addEventListener('input', function() {
    syncHighlight(this.value);
    if (mode === 'raw') { updateCounter(); }
  });

  // -- Mode toggle --------------------------------------------------------
  function setMode(next) {
    if (next === mode) { return; }

    if (next === 'visual') {
      // raw -> visual
      const vars    = parseRaw(document.getElementById('rawEditor').value);
      clearRows();
      const entries = Object.entries(vars);
      if (entries.length === 0) { addRow(); }
      else { entries.forEach(([k, v]) => addRowWith(k, v)); }
      updateCounter();
      document.getElementById('rawMode').style.display    = 'none';
      document.getElementById('visualMode').style.display = 'block';
      document.getElementById('btnRaw').classList.remove('active');
      document.getElementById('btnVisual').classList.add('active');
    } else {
      // visual -> raw
      const raw = toRaw(collectVars());
      document.getElementById('rawEditor').value = raw;
      syncHighlight(raw);
      updateCounter();
      document.getElementById('visualMode').style.display = 'none';
      document.getElementById('rawMode').style.display    = 'block';
      document.getElementById('btnVisual').classList.remove('active');
      document.getElementById('btnRaw').classList.add('active');
    }
    mode = next;
  }

  // -- File import --------------------------------------------------------
  function pickFile() {
    vscode.postMessage({ command: 'pickFile' });
  }

  window.addEventListener('message', (event) => {
    if (event.data.command !== 'fileImported') { return; }
    loadVars(event.data.variables);
  });

  function loadVars(vars) {
    if (mode === 'raw') {
      const raw = toRaw(vars);
      document.getElementById('rawEditor').value = raw;
      syncHighlight(raw);
    } else {
      clearRows();
      const entries = Object.entries(vars);
      if (entries.length === 0) { addRow(); }
      else { entries.forEach(([k, v]) => addRowWith(k, v)); }
    }
    updateCounter();
  }

  // -- Visual editor ------------------------------------------------------
  function addRow() {
    if (readOnly) { return; }
    addRowWith('', '');
    updateCounter();
    const rows = document.querySelectorAll('.var-row');
    rows[rows.length - 1].querySelector('.var-key').focus();
  }

  function addRowWith(key, value) {
    const list = document.getElementById('varList');
    const row  = document.createElement('div');
    const keyInput = document.createElement('input');
    const valueInput = document.createElement('input');
    const removeBtn = document.createElement('button');

    row.className = 'var-row';

    keyInput.type = 'text';
    keyInput.className = 'var-key';
    keyInput.placeholder = 'DB_HOST';
    keyInput.value = String(key ?? '');

    valueInput.type = 'text';
    valueInput.className = 'var-value';
    valueInput.placeholder = 'valor';
    valueInput.value = String(value ?? '');

    removeBtn.type = 'button';
    removeBtn.className = 'btn-icon danger';
    removeBtn.title = 'Eliminar';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => removeRow(removeBtn));

    if (readOnly) {
      keyInput.setAttribute('readonly', 'true');
      valueInput.setAttribute('readonly', 'true');
      removeBtn.style.display = 'none';
    }

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);
    list.appendChild(row);
    keyInput.addEventListener('input', updateCounter);
  }

  function clearRows() { document.getElementById('varList').innerHTML = ''; }
  function removeRow(btn) { btn.closest('.var-row').remove(); updateCounter(); }

  function collectVars() {
    const result = {};
    document.querySelectorAll('.var-row').forEach(row => {
      const k = row.querySelector('.var-key').value.trim();
      const v = row.querySelector('.var-value').value;
      if (k) { result[k] = v; }
    });
    return result;
  }

  // -- Counter ------------------------------------------------------------
  function updateCounter() {
    const count = mode === 'visual'
      ? Object.keys(collectVars()).length
      : Object.keys(parseRaw(document.getElementById('rawEditor').value)).length;
    document.getElementById('varCounter').textContent = count + ' vars';
  }

  // -- Raw helpers --------------------------------------------------------
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

  // -- Save / cancel ------------------------------------------------------
  function save() {
    if (readOnly) { return; }
    const name      = document.getElementById('profileName').value.trim();
    const variables = mode === 'visual'
      ? collectVars()
      : parseRaw(document.getElementById('rawEditor').value);
    vscode.postMessage({ command: 'save', profile: { name, variables } });
  }

  function cancel() { vscode.postMessage({ command: 'cancel' }); }

  function esc(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  init();
</script>
</body>
</html>`;
}

function createNonce(): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
