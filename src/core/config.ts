import type { Command } from 'commander';
import { sweetLinkEnv } from '../env';
import type { CliConfig } from '../types';
import { readCommandOptions } from './env';

export interface RootProgramOptions {
  readonly appUrl: string;
  readonly daemonUrl: string;
  readonly adminKey: string | null;
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
  const rawOptions = readCommandOptions<{ appUrl?: unknown; daemonUrl?: unknown; adminKey?: unknown }>(command);
  return {
    appUrl: normalizeUrlOption(rawOptions.appUrl, sweetLinkEnv.appUrl),
    daemonUrl: normalizeUrlOption(rawOptions.daemonUrl, sweetLinkEnv.daemonUrl),
    adminKey: normalizeAdminKey(rawOptions.adminKey),
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
  };
}
