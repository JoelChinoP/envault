# Envault — VS Code Extension

Gestión de perfiles `.env` por empresa/rama sin tocar el repositorio.

## Instalación y desarrollo

```bash
npm install
npm run compile
# F5 en VS Code para abrir ventana de extensión
```

## Uso

1. Abre cualquier workspace
2. Click en el ícono 🔒 de la barra lateral (Envault)
3. **[+]** para crear un perfil — por defecto abre en modo archivo
4. Click en un perfil para aplicarlo → escribe el `.env` al instante
5. La barra inferior muestra el perfil activo en todo momento

## Modos del editor de perfil

- **✎ Archivo** (default) — edita como texto plano con syntax highlighting: claves en azul, valores en blanco, comentarios en gris
- **⊞ Visual** — editor fila por fila clave/valor

Ambos modos se sincronizan al cambiar entre ellos.

## Importar variables

- **📂 Importar archivo** — abre el file picker nativo del OS, carga el `.env` elegido omitiendo comentarios
- **Click derecho en workspace → Importar .env actual** — carga el `.env` del workspace directamente

## Almacenamiento

Todo se guarda en `globalStorageUri` de VS Code, completamente fuera de los repositorios:

```
~/.config/Code/User/globalStorage/<id>/
  workspaces/<hash>/
    meta.json
    active.json
    profiles/
      LOCAL.json
      EMPRESA_B.json
```

## Publicar

```bash
npm install -g vsce
vsce package   # genera envault-0.1.0.vsix
vsce publish
```
