# ENV Manager — VS Code Extension

Gestión de perfiles `.env` por empresa/rama sin tocar el repositorio.

## Características

- 🗂 **Sidebar visual** — ve todos tus repos y sus perfiles en la barra lateral
- ✅ **Un click para aplicar** — cambia de perfil sin tocar ningún archivo manualmente
- 🔑 **Status bar** — siempre sabes qué perfil está activo
- 📥 **Importar .env** — convierte tu `.env` actual en un perfil con un click
- 🔒 **Sin tocar el repo** — todo se guarda en el storage global de VS Code

## Instalación

```bash
npm install
npm run compile
```

Luego presiona `F5` en VS Code para abrir la ventana de desarrollo.

## Uso

1. Abre cualquier workspace (repo)
2. Haz click en el ícono 🔑 de la barra lateral
3. Usa **[+]** para crear un nuevo perfil, o click derecho en el workspace para importar el `.env` actual
4. Click en cualquier perfil para aplicarlo — el `.env` se escribe automáticamente

## Estructura de archivos

```
src/
  extension.ts              # Punto de entrada, registro de comandos
  types/index.ts            # Tipos TypeScript
  storage/StorageService.ts # Lee/escribe perfiles en globalStorageUri
  providers/
    EnvTreeProvider.ts      # TreeDataProvider del sidebar
  services/
    EnvWriter.ts            # Lee y escribe el .env en el workspace
  ui/
    StatusBarManager.ts     # Indicador en la barra inferior
    ProfileEditorPanel.ts   # Webview para crear/editar perfiles
```

## Dónde se guardan los perfiles

```
~/.config/Code/User/globalStorage/<extension-id>/
  workspaces/
    <hash-del-path>/
      meta.json
      active.json
      profiles/
        MINCOR.json
        EMPRESA_B.json
```

Completamente fuera de cualquier repositorio. No aparece en git.

## Publicar

```bash
npm install -g vsce
vsce package   # genera .vsix
vsce publish   # publica en el Marketplace
```
