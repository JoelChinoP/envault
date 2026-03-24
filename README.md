# Envault - VS Code Extension

Envault permite gestionar perfiles de variables de entorno por workspace y aplicar un perfil al archivo `.env` sin guardar secretos en el repositorio.

## Objetivo

- Mantener perfiles `.env` por proyecto.
- Aplicar un perfil con un click.
- Guardar los perfiles fuera del repo usando `globalStorageUri`.

## Funcionalidades actuales

- Crear, editar y eliminar perfiles.
- Aplicar un perfil al `.env` del workspace activo.
- Importar variables desde `.env` del workspace o desde archivo externo.
- Ver perfiles de otros workspaces en modo solo lectura.
- Ver perfil activo en la barra de estado.

## Arquitectura actual (simple)

- `src/extension.ts`: punto de entrada, registro de comandos y coordinación general.
- `src/providers/EnvTreeProvider.ts`: árbol de workspaces y perfiles.
- `src/storage/StorageService.ts`: persistencia en `globalStorageUri`.
- `src/services/EnvWriter.ts`: lectura/escritura y parseo de `.env`.
- `src/ui/ProfileEditorPanel.ts`: webview del editor (modo archivo y visual).
- `src/ui/StatusBarManager.ts`: estado del perfil activo en la status bar.

## Estructura de datos

Los perfiles se guardan en JSON por workspace:

```text
globalStorage/<extension-id>/
  workspaces/<workspace-hash>/
    meta.json
    active.json
    profiles/
      LOCAL.json
      STAGING.json
```

## Desarrollo local

```bash
npm install
npm run compile
```

Luego presiona `F5` en VS Code para abrir la ventana de extensión.

## Plan de mejora en 1 dia (sin sobrearquitectura)

Este plan evita introducir capas complejas y se enfoca en limpieza real del codigo.

### Bloque 1 - Ordenar responsabilidades (2-3 horas)

1. Extraer utilidades de variables `.env` a un archivo compartido, por ejemplo `src/services/envFormat.ts`.
2. Mover ahi funciones duplicadas de parseo/serializacion que hoy existen tanto en `EnvWriter` como en el script del webview.
3. Dejar una sola regla de validacion para keys/values y reutilizarla en guardado y aplicacion.

Resultado esperado: menos duplicacion y menos errores por comportamiento inconsistente.

### Bloque 2 - Limpiar comandos sin usar Use Cases (2 horas)

1. Separar handlers de comandos de `extension.ts` a `src/commands/`:
   - `profileCommands.ts`
   - `workspaceViewCommands.ts`
2. Mantener `extension.ts` solo para crear dependencias y registrar comandos.

Resultado esperado: archivo de entrada mas corto y facil de mantener.

### Bloque 3 - Reducir complejidad del Webview (2-3 horas)

1. Separar en el panel:
   - logica TypeScript del panel
   - template HTML/CSS/JS en funciones auxiliares (sin framework)
2. Mantener validaciones criticas en TypeScript (lado extension), no solo en JS embebido.

Resultado esperado: cambios de UI mas simples y menor riesgo de romper guardado/importacion.

### Bloque 4 - Verificacion final (1 hora)

1. Compilar con `npm run compile`.
2. Probar flujo manual:
   - crear perfil
   - editar y guardar
   - importar desde archivo
   - aplicar perfil
   - eliminar perfil activo
3. Actualizar este README con lo implementado.

Resultado esperado: mejora visible en legibilidad del codigo sin cambiar comportamiento para el usuario.

## Criterio de exito para este plan

- `extension.ts` significativamente mas pequeno.
- Una sola implementacion de parseo/validacion `.env`.
- Menos codigo embebido en el panel.
- Flujo funcional intacto para usuario final.

## Publicacion

```bash
npm install -g vsce
vsce package
vsce publish
```
