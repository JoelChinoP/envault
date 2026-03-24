export const ENV_KEY_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

export const ENV_VARIABLE_LIMITS = {
  maxEntries: 1000,
  maxKeyLength: 128,
  maxValueLength: 8192,
} as const;

export function parseEnvContent(content: string): Record<string, string> {
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

export function sanitizeEnvVariables(
  input: Record<string, string>,
): Record<string, string> {
  const entries = Object.entries(input);
  if (entries.length > ENV_VARIABLE_LIMITS.maxEntries) {
    throw new Error(
      `Demasiadas variables para un perfil (max ${ENV_VARIABLE_LIMITS.maxEntries})`,
    );
  }

  const sanitized: Record<string, string> = {};
  for (const [rawKey, rawValue] of entries) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }
    if (!ENV_KEY_REGEX.test(key)) {
      throw new Error(`Clave invalida: ${rawKey}`);
    }
    if (key.length > ENV_VARIABLE_LIMITS.maxKeyLength) {
      throw new Error(`Clave demasiado larga: ${rawKey}`);
    }

    const value = String(rawValue);
    if (value.length > ENV_VARIABLE_LIMITS.maxValueLength) {
      throw new Error(`Valor demasiado largo para ${key}`);
    }
    if (/[\r\n]/.test(value)) {
      throw new Error(`El valor de ${key} no puede contener saltos de linea`);
    }

    sanitized[key] = value;
  }

  return sanitized;
}

export function serializeEnvContent(
  variables: Record<string, string>,
  options?: {
    includeHeader?: boolean;
    appliedAt?: string;
  },
): string {
  const includeHeader = options?.includeHeader ?? false;
  const appliedAt = options?.appliedAt ?? new Date().toISOString();
  const sanitized = sanitizeEnvVariables(variables);

  const lines: string[] = [];
  if (includeHeader) {
    lines.push('# Generado por Envault - no editar manualmente');
    lines.push(`# Aplicado: ${appliedAt}`);
    lines.push('');
  }

  for (const [key, value] of Object.entries(sanitized)) {
    const needsQuotes =
      value.includes(' ') ||
      value.includes('#') ||
      value.includes('"') ||
      value.includes("'");

    const safeValue = needsQuotes
      ? `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : value;

    lines.push(`${key}=${safeValue}`);
  }

  return `${lines.join('\n')}\n`;
}
