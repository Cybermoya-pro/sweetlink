import type { Command } from 'commander';
import path from 'node:path';
import { sweetLinkEnv } from '../env';
import type { CliConfig } from '../types';
import { loadSweetLinkFileConfig } from './config-file';
import { readCommandOptions } from './env';

export interface RootProgramOptions {
  readonly appUrl: string;
  readonly daemonUrl: string;
  readonly adminKey: string | null;
  readonly oauthScriptPath: string | null;
}

const normalizeUrlOption = (value: unknown, fallback: string): string => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return fallback;
};

const normalizeAdminKey = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
};

/** Reads the root program options, falling back to defaults when values are missing. */
export const readRootProgramOptions = (command: Command): RootProgramOptions => {
  const rawOptions = readCommandOptions<{
    appUrl?: unknown;
    url?: unknown;
    daemonUrl?: unknown;
    adminKey?: unknown;
    port?: unknown;
    oauthScript?: unknown;
  }>(command);
  const { config } = loadSweetLinkFileConfig();
  let optionUrl: string | undefined;
  if (typeof rawOptions.appUrl === 'string') {
    optionUrl = rawOptions.appUrl;
  } else if (typeof rawOptions.url === 'string') {
    optionUrl = rawOptions.url;
  } else {
    optionUrl = undefined;
  }
  const optionPort = normalizePort(rawOptions.port);
  const configPort = typeof config.port === 'number' ? config.port : null;

  const fallbackAppUrl = resolveDefaultAppUrl({
    optionUrl,
    optionPort,
    configAppUrl: config.appUrl,
    configPort,
  });
  const fallbackDaemonUrl = config.daemonUrl ?? sweetLinkEnv.daemonUrl;
  const fallbackAdminKey =
    rawOptions.adminKey ?? config.adminKey ?? sweetLinkEnv.localAdminApiKey ?? sweetLinkEnv.adminApiKey ?? null;
  let optionOauthScriptPath: string | null = null;
  if (typeof rawOptions.oauthScript === 'string') {
    const trimmed = rawOptions.oauthScript.trim();
    if (trimmed.length > 0) {
      optionOauthScriptPath = resolveCliPath(trimmed);
    }
  }
  const fallbackOauthScriptPath =
    optionOauthScriptPath ??
    config.oauthScript ??
    (sweetLinkEnv.cliOauthScriptPath ? resolveCliPath(sweetLinkEnv.cliOauthScriptPath) : null);

  return {
    appUrl: normalizeUrlOption(optionUrl, fallbackAppUrl),
    daemonUrl: normalizeUrlOption(rawOptions.daemonUrl, fallbackDaemonUrl),
    adminKey: normalizeAdminKey(fallbackAdminKey),
    oauthScriptPath: fallbackOauthScriptPath,
  };
};

/** Extracts SweetLink CLI configuration (app/daemon URLs and admin key). */
export function resolveConfig(command: Command): CliConfig {
  const parent = command.parent ?? command;
  const options = readRootProgramOptions(parent);
  return {
    adminApiKey: options.adminKey,
    appBaseUrl: options.appUrl,
    daemonBaseUrl: options.daemonUrl,
    oauthScriptPath: options.oauthScriptPath,
  };
}

interface ResolveAppUrlOptions {
  readonly optionUrl?: string;
  readonly optionPort: number | null;
  readonly configAppUrl?: string;
  readonly configPort: number | null;
}

const LOCAL_DEFAULT_URL = 'http://localhost:3000';

function resolveDefaultAppUrl({ optionUrl, optionPort, configAppUrl, configPort }: ResolveAppUrlOptions): string {
  if (optionUrl && optionUrl.trim().length > 0) {
    return optionUrl;
  }

  if (typeof optionPort === 'number') {
    return applyPortToUrl(configAppUrl ?? sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, optionPort);
  }

  if (configAppUrl) {
    return configAppUrl;
  }

  if (configPort) {
    return applyPortToUrl(sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL, configPort);
  }

  return sweetLinkEnv.appUrl ?? LOCAL_DEFAULT_URL;
}

function applyPortToUrl(base: string, port: number): string {
  try {
    const url = new URL(base);
    url.port = String(port);
    return url.toString();
  } catch {
    return `http://localhost:${port}`;
  }
}

function normalizePort(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

const resolveCliPath = (candidate: string): string => {
  if (path.isAbsolute(candidate)) {
    return candidate;
  }
  return path.resolve(process.cwd(), candidate);
};
