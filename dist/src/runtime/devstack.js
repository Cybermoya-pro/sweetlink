import { spawn } from 'node:child_process';
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
export function maybeInstallMkcertDispatcher() {
    const overridePath = cliEnv.caPath;
    const mkcertRoot = cliEnv.caRoot;
    const candidates = [
        overridePath,
        path.join(mkcertRoot, 'rootCA.pem'),
        path.join(os.homedir(), '.sweetlink', 'certs', 'localhost-cert.pem'),
    ].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);
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
        }
        catch (error) {
            console.warn(`Failed to register SweetLink TLS CA from ${formatPathForDisplay(candidate)}:`, error);
        }
    }
}
/** Ensures the local dev server and database are online, attempting to start them via runner when needed. */
export async function ensureDevStackRunning(targetUrl, options) {
    const appOrigin = targetUrl.origin;
    const [appReady, dbReady] = await Promise.all([isAppReachable(appOrigin), isDatabaseReachable()]);
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
        }
        catch (error) {
            console.warn('Failed to launch dev stack automatically:', extractEventMessage(error));
        }
    }
    else if (sweetLinkDebug) {
        console.log('Dev stack tmux session detected; waiting for readiness without restarting.');
    }
    const timeoutMs = 90000;
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const [readyApp, readyDb] = await Promise.all([isAppReachable(appOrigin), isDatabaseReachable()]);
        if (readyApp && readyDb) {
            console.log('Dev stack is online (web + database).');
            return;
        }
        await delay(1000);
    }
    console.warn('Dev stack did not become ready within 90s. Expect follow-up commands to fail until `pnpm run dev` finishes booting.');
}
/** Performs a lightweight HEAD request to confirm the web app responds. */
export async function isAppReachable(appBaseUrl) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        try {
            await fetch(appBaseUrl, { method: 'HEAD', redirect: 'manual', signal: controller.signal });
            return true;
        }
        finally {
            clearTimeout(timeout);
        }
    }
    catch (error) {
        const message = extractEventMessage(error);
        if (message.includes('ECONNREFUSED') || message.includes('ENOTFOUND') || message.includes('EHOSTUNREACH')) {
            return false;
        }
        if (error.name === 'AbortError') {
            return false;
        }
        return false;
    }
}
/** Checks common Postgres ports to see if the local database is reachable. */
export async function isDatabaseReachable() {
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
function resolveCandidateDbPorts() {
    const ports = new Set();
    const addPort = (value) => {
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
        }
        catch {
            /* ignore malformed env URLs */
        }
    }
    addPort(5432);
    addPort(6432);
    return [...ports];
}
async function runCommand(command, args, options = {}) {
    return await new Promise((resolve, reject) => {
        const child = spawn(command, args, { stdio: 'inherit', ...options });
        child.once('error', (error) => reject(error));
        child.once('close', (code) => resolve(code ?? 0));
    });
}
async function isDevTmuxSessionActive() {
    const sessions = await listTmuxSessions();
    if (!sessions) {
        return false;
    }
    return sessions.some((session) => session === 'sweetistics-dev' || session.startsWith('sweetistics-dev-'));
}
async function listTmuxSessions() {
    return await new Promise((resolve) => {
        try {
            const child = spawn('tmux', ['list-sessions', '-F', '#S'], {
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const names = [];
            child.stdout?.on('data', (chunk) => {
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
        }
        catch {
            resolve(null);
        }
    });
}
async function isTcpPortReachable(host, port, timeoutMs = 1000) {
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
//# sourceMappingURL=devstack.js.map