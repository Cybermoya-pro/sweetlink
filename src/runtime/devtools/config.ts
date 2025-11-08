import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sweetLinkDebug } from '../../env.js';
import { isErrnoException } from '../../util/errors.js';
import { DEVTOOLS_CONFIG_PATH, DEVTOOLS_STATE_PATH } from './constants.js';
import type { DevToolsConfig, DevToolsState } from './types.js';

export async function loadDevToolsConfig(): Promise<DevToolsConfig | null> {
  try {
    const raw = await readFile(DEVTOOLS_CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DevToolsConfig;
    if (!parsed.devtoolsUrl) {
      return null;
    }
    return parsed;
  } catch (error) {
    if (sweetLinkDebug && (!isErrnoException(error) || error.code !== 'ENOENT')) {
      console.warn('Failed to read DevTools config:', error);
    }
    return null;
  }
}

export async function saveDevToolsConfig(patch: Partial<DevToolsConfig> & { devtoolsUrl: string }): Promise<void> {
  const existing = await loadDevToolsConfig();
  const next: DevToolsConfig = {
    devtoolsUrl: patch.devtoolsUrl,
    port: ensureConfigField(patch.port ?? existing?.port, 'DevTools port is required'),
    userDataDir: ensureConfigField(patch.userDataDir ?? existing?.userDataDir, 'DevTools userDataDir is required'),
    updatedAt: patch.updatedAt ?? existing?.updatedAt ?? Date.now(),
    targetUrl: patch.targetUrl ?? existing?.targetUrl,
    sessionId: patch.sessionId ?? existing?.sessionId,
    viewport: patch.viewport ?? existing?.viewport,
  };

  const configDirectory = path.dirname(DEVTOOLS_CONFIG_PATH);
  await mkdir(configDirectory, { recursive: true });
  await writeFile(DEVTOOLS_CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
}

export async function loadDevToolsState(): Promise<DevToolsState | null> {
  try {
    const raw = await readFile(DEVTOOLS_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as DevToolsState;
    if (!parsed.console) parsed.console = [];
    if (!parsed.network) parsed.network = [];
    return parsed;
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') {
      return null;
    }
    console.warn('Failed to read DevTools state:', error);
    return null;
  }
}

export async function saveDevToolsState(state: DevToolsState): Promise<void> {
  state.updatedAt = Date.now();
  const stateDirectory = path.dirname(DEVTOOLS_STATE_PATH);
  await mkdir(stateDirectory, { recursive: true });
  await writeFile(DEVTOOLS_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

export function deriveDevtoolsLinkInfo(
  config: DevToolsConfig | null,
  state: DevToolsState | null
): { endpoint: string | null; sessionIds: Set<string> } {
  const sessionIds = new Set<string>();
  if (config?.sessionId) {
    sessionIds.add(config.sessionId);
  }
  if (state?.sessionId) {
    sessionIds.add(state.sessionId);
  }

  const endpoint = config?.devtoolsUrl ?? state?.endpoint ?? null;
  return { endpoint, sessionIds };
}

function ensureConfigField<T>(value: T | null | undefined, message: string): T {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
