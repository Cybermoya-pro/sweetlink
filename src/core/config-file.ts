import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface SweetLinkFileConfig {
  appUrl?: string;
  prodUrl?: string;
  daemonUrl?: string;
  adminKey?: string;
  port?: number;
}

interface LoadedConfig {
  readonly path: string | null;
  readonly config: SweetLinkFileConfig;
}

const CONFIG_BASENAMES = ['sweetlink.json', 'sweetlink.config.json'];

let cachedConfig: LoadedConfig | null = null;

export function resetSweetLinkFileConfigCache(): void {
  cachedConfig = null;
}

export function loadSweetLinkFileConfig(): LoadedConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const resolvedPath = findConfigPath(process.cwd());
  if (!resolvedPath) {
    cachedConfig = { path: null, config: {} };
    return cachedConfig;
  }

  try {
    const raw = readFileSync(resolvedPath, 'utf8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const config = normalizeConfig(parsed);
    cachedConfig = { path: resolvedPath, config };
    return cachedConfig;
  } catch (error) {
    console.warn(
      `[sweetlink] Failed to read configuration from ${resolvedPath}:`,
      error instanceof Error ? error.message : error
    );
    cachedConfig = { path: resolvedPath, config: {} };
    return cachedConfig;
  }
}

function findConfigPath(initialDirectory: string): string | null {
  let current: string | null = initialDirectory;
  while (current) {
    for (const basename of CONFIG_BASENAMES) {
      const candidate = path.join(current, basename);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  return null;
}

function normalizeConfig(raw: Record<string, unknown>): SweetLinkFileConfig {
  const config: SweetLinkFileConfig = {};
  if (typeof raw.appUrl === 'string') {
    const trimmed = raw.appUrl.trim();
    if (trimmed.length > 0) {
      config.appUrl = trimmed;
    }
  }
  if (typeof raw.prodUrl === 'string') {
    const trimmed = raw.prodUrl.trim();
    if (trimmed.length > 0) {
      config.prodUrl = trimmed;
    }
  }
  if (typeof raw.daemonUrl === 'string') {
    const trimmed = raw.daemonUrl.trim();
    if (trimmed.length > 0) {
      config.daemonUrl = trimmed;
    }
  }
  if (typeof raw.adminKey === 'string') {
    const trimmed = raw.adminKey.trim();
    if (trimmed.length > 0) {
      config.adminKey = trimmed;
    }
  }
  if (typeof raw.port === 'number' && Number.isFinite(raw.port) && raw.port > 0) {
    config.port = Math.floor(raw.port);
  }
  return config;
}
