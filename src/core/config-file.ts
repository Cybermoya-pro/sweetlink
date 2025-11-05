import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export interface SweetLinkCookieMapping {
  hosts: string[];
  origins: string[];
}

export interface SweetLinkHealthChecksConfig {
  paths: string[];
}

export interface SweetLinkSmokeRoutesConfig {
  defaults?: string[];
  presets?: Record<string, string[]>;
}

export interface SweetLinkFileConfig {
  appUrl?: string;
  prodUrl?: string;
  daemonUrl?: string;
  adminKey?: string;
  port?: number;
  cookieMappings?: SweetLinkCookieMapping[];
  healthChecks?: SweetLinkHealthChecksConfig;
  smokeRoutes?: SweetLinkSmokeRoutesConfig;
  oauthScript?: string;
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
    const baseDirectory = path.dirname(resolvedPath);
    const config = normalizeConfig(parsed, baseDirectory);
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

function normalizeConfig(raw: Record<string, unknown>, baseDirectory: string | null): SweetLinkFileConfig {
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
  const cookieMappings = normalizeCookieMappingsSection(raw.cookieMappings);
  if (cookieMappings.length > 0) {
    config.cookieMappings = cookieMappings;
  }
  const healthChecks = normalizeHealthChecksSection(raw.healthChecks);
  if (healthChecks) {
    config.healthChecks = healthChecks;
  }
  const smokeRoutes = normalizeSmokeRoutesSection(raw.smokeRoutes);
  if (smokeRoutes) {
    config.smokeRoutes = smokeRoutes;
  }
  if (typeof raw.oauthScript === 'string') {
    const trimmed = raw.oauthScript.trim();
    if (trimmed.length > 0) {
      const resolved = resolveConfigPath(trimmed, baseDirectory);
      config.oauthScript = resolved;
    }
  }
  return config;
}

function resolveConfigPath(candidate: string, baseDirectory: string | null): string {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  const base = baseDirectory ?? process.cwd();
  return path.resolve(base, candidate);
}

function normalizeStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    const results: string[] = [];
    for (const item of value) {
      if (typeof item !== 'string') {
        continue;
      }
      const trimmed = item.trim();
      if (trimmed.length > 0) {
        results.push(trimmed);
      }
    }
    return results;
  }
  return [];
}

function normalizeCookieMappingsSection(value: unknown): SweetLinkCookieMapping[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const mappings: SweetLinkCookieMapping[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const hostsRaw = normalizeStringArray(
      (entry as { hosts?: unknown; match?: unknown }).hosts ?? (entry as { match?: unknown }).match
    );
    const originsRaw = normalizeStringArray(
      (entry as { origins?: unknown; include?: unknown }).origins ?? (entry as { include?: unknown }).include
    );
    if (hostsRaw.length === 0 || originsRaw.length === 0) {
      continue;
    }
    mappings.push({ hosts: hostsRaw.map((host) => host.toLowerCase()), origins: originsRaw });
  }
  return mappings;
}

function normalizeHealthChecksSection(value: unknown): SweetLinkHealthChecksConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const paths = normalizeStringArray(
    (value as { paths?: unknown; path?: unknown }).paths ?? (value as { path?: unknown }).path
  );
  return paths.length > 0 ? { paths } : null;
}

function normalizeSmokeRoutesSection(value: unknown): SweetLinkSmokeRoutesConfig | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const defaults = normalizeStringArray((value as { defaults?: unknown }).defaults);
  const rawPresets = (value as { presets?: unknown }).presets;
  const normalizedPresets: Record<string, string[]> = {};
  if (rawPresets && typeof rawPresets === 'object') {
    for (const [key, routeList] of Object.entries(rawPresets as Record<string, unknown>)) {
      const routes = normalizeStringArray(routeList);
      if (routes.length > 0) {
        normalizedPresets[key] = routes;
      }
    }
  }
  const hasDefaults = defaults.length > 0;
  const hasPresets = Object.keys(normalizedPresets).length > 0;
  if (!hasDefaults && !hasPresets) {
    return null;
  }
  const config: SweetLinkSmokeRoutesConfig = {
    ...(hasDefaults ? { defaults } : {}),
    ...(hasPresets ? { presets: normalizedPresets } : {}),
  };
  return config;
}
