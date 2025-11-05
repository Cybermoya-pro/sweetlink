import { type SpawnOptions, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { Agent, setGlobalDispatcher } from 'undici';
import { readLocalEnvString } from '../core/env';
import { cliEnv, sweetLinkDebug } from '../env';
import { extractEventMessage } from '../util/errors';
import { formatPathForDisplay } from '../util/path';
import { delay } from '../util/time';

/** Registers the mkcert CA with undici so HTTPS requests succeed without NODE_TLS_REJECT_UNAUTHORIZED hacks. */
export function maybeInstallMkcertDispatcher(): void {
  const overridePath = cliEnv.caPath;
  const mkcertRoot = cliEnv.caRoot;
  const candidates = [
    overridePath,
    path.join(mkcertRoot, 'rootCA.pem'),
    path.join(os.homedir(), '.sweetlink', 'certs', 'localhost-cert.pem'),
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0);

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      continue;
    }
    try {
      const ca = readFileSync(candidate);
      setGlobalDispatcher(new Agent({ connect: { ca } }));
      if (sweetLinkDebug) {
        console.info(`configured mkcert CA from ${formatPathForDisplay(candidate)}`);
      }
      return;
    } catch (error) {
      console.warn(`Failed to register SweetLink TLS CA from ${formatPathForDisplay(candidate)}:`, error);
    }
  }
}

/** Ensures the local dev server and database are online, attempting to start them via runner when needed. */
export async function ensureDevStackRunning(
  targetUrl: URL,
  options: { repoRoot: string; healthPaths?: readonly string[] }
): Promise<void> {
  const appOrigin = targetUrl.origin;
  const [appReady, dbReady] = await Promise.all([
    isAppReachable(appOrigin, options.healthPaths),
    isDatabaseReachable(),
  ]);
  if (appReady && dbReady) {
    return;
  }

  const developmentSessionRunning = await isDevTmuxSessionActive();
  if (!developmentSessionRunning) {
    console.log('Detected dev stack offline. Starting `pnpm run dev` via runner…');
    try {
      const runnerPath = path.join(options.repoRoot, 'runner');
      const exitCode = await runCommand(runnerPath, ['pnpm', 'run', 'dev'], { cwd: options.repoRoot });
      if (exitCode !== 0) {
        console.warn(`runner pnpm run dev exited with code ${exitCode}. Continuing startup check.`);
      }
    } catch (error) {
      console.warn('Failed to launch dev stack automatically:', extractEventMessage(error));
    }
  } else if (sweetLinkDebug) {
    console.log('Dev stack tmux session detected; waiting for readiness without restarting.');
  }

  const timeoutMs = 90_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [readyApp, readyDb] = await Promise.all([
      isAppReachable(appOrigin, options.healthPaths),
      isDatabaseReachable(),
    ]);
    if (readyApp && readyDb) {
      console.log('Dev stack is online (web + database).');
      return;
    }
    await delay(1000);
  }

  console.warn(
    'Dev stack did not become ready within 90s. Expect follow-up commands to fail until `pnpm run dev` finishes booting.'
  );
}

/** Performs lightweight HEAD requests to confirm the web app responds. */
export async function isAppReachable(appBaseUrl: string, healthPaths?: readonly string[]): Promise<boolean> {
  const targets = new Set<string>([appBaseUrl]);
  if (Array.isArray(healthPaths)) {
    for (const pathCandidate of healthPaths) {
      if (typeof pathCandidate !== 'string' || pathCandidate.trim().length === 0) {
        continue;
      }
      const trimmed = pathCandidate.trim();
      try {
        const target = trimmed.startsWith('http')
          ? new URL(trimmed)
          : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, appBaseUrl);
        targets.add(target.toString());
      } catch (error) {
        void error;
      }
    }
  }

  for (const target of targets) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      try {
        await fetch(target, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
        return true;
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message = extractEventMessage(error);
      const isAbort = (error as { name?: string }).name === 'AbortError';
      if (
        !message.includes('ECONNREFUSED') &&
        !message.includes('ENOTFOUND') &&
        !message.includes('EHOSTUNREACH') &&
        !isAbort
      ) {
        return false;
      }
    }
  }

  return false;
}

/** Checks common Postgres ports to see if the local database is reachable. */
export async function isDatabaseReachable(): Promise<boolean> {
  const ports = resolveCandidateDbPorts();
  if (ports.length === 0) {
    return false;
  }
  for (const port of ports) {
    if (await isTcpPortReachable('127.0.0.1', port)) {
      return true;
    }
  }
  return false;
}

function resolveCandidateDbPorts(): number[] {
  const ports = new Set<number>();
  const addPort = (value: unknown) => {
    const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      ports.add(parsed);
    }
  };

  addPort(readLocalEnvString('SWEETISTICS_LOCAL_POSTGRES_PORT'));
  const directUrl = readLocalEnvString('DIRECT_DATABASE_URL') ?? readLocalEnvString('DATABASE_URL');
  if (directUrl) {
    try {
      const parsed = new URL(directUrl);
      if (parsed.port) {
        addPort(parsed.port);
      }
    } catch {
      /* ignore malformed env URLs */
    }
  }
  addPort(5432);
  addPort(6432);
  return [...ports];
}

async function runCommand(command: string, args: string[], options: SpawnOptions = {}): Promise<number> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.once('error', (error) => reject(error));
    child.once('close', (code) => resolve(code ?? 0));
  });
}

async function isDevTmuxSessionActive(): Promise<boolean> {
  const sessions = await listTmuxSessions();
  if (!sessions) {
    return false;
  }
  return sessions.some((session) => session === 'sweetistics-dev' || session.startsWith('sweetistics-dev-'));
}

async function listTmuxSessions(): Promise<string[] | null> {
  return await new Promise((resolve) => {
    try {
      const child = spawn('tmux', ['list-sessions', '-F', '#S'], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      const names: string[] = [];
      child.stdout?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        for (const line of text.split(/\r?\n/)) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            names.push(trimmed);
          }
        }
      });
      child.once('error', () => resolve(null));
      child.once('close', (code) => {
        if (code !== 0) {
          resolve(null);
          return;
        }
        resolve(names);
      });
    } catch {
      resolve(null);
    }
  });
}

async function isTcpPortReachable(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  if (!Number.isFinite(port) || port <= 0) {
    return false;
  }
  return await new Promise((resolve) => {
    const socket = net.createConnection({ host, port, timeout: timeoutMs }, () => {
      socket.end();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}
