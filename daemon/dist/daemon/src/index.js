#!/usr/bin/env node
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _SweetLinkState_instances, _SweetLinkState_secret, _SweetLinkState_sessions, _SweetLinkState_handleRegister, _SweetLinkState_touchSession, _SweetLinkState_handleCommandResult, _SweetLinkState_handleConsoleEvents, _SweetLinkState_socketStateToString, _SweetLinkState_removeSession, _SweetLinkState_expireStaleSessions;
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer as createHttpsServer, request as httpsRequest } from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { URL } from 'node:url';
import { createSweetLinkCommandId, SWEETLINK_HEARTBEAT_INTERVAL_MS, SWEETLINK_HEARTBEAT_TOLERANCE_MS, SWEETLINK_WS_PATH, verifySweetLinkToken, } from '@sweetlink/shared';
import { sweetLinkEnv } from '@sweetlink/shared/env';
import { getDefaultSweetLinkSecretPath, resolveSweetLinkSecret } from '@sweetlink/shared/node';
import WebSocket, { WebSocketServer } from 'ws';
import { generateSessionCodename } from './codename';
const SHUTDOWN_GRACE_MS = 1000;
const unrefTimer = (handle) => {
    const candidate = handle;
    if (typeof candidate === 'object' && candidate !== null && 'unref' in candidate) {
        const unref = candidate.unref;
        if (typeof unref === 'function') {
            unref.call(candidate);
        }
    }
};
const CERT_DIR = path.join(os.homedir(), '.sweetlink', 'certs');
const CERT_PATH = path.join(CERT_DIR, 'localhost-cert.pem');
const KEY_PATH = path.join(CERT_DIR, 'localhost-key.pem');
const SOCKET_STATE_LABEL = {
    0: 'connecting',
    1: 'open',
    2: 'closing',
    3: 'closed',
};
async function main() {
    try {
        const port = sweetLinkEnv.port;
        if (await isDaemonAlreadyRunning(port)) {
            log(`SweetLink daemon already running on https://localhost:${port}; exiting.`);
            return;
        }
        const secretResolution = await resolveSweetLinkSecret({ autoCreate: true });
        log(`SweetLink secret source: ${secretResolution.source}${secretResolution.path ? ` (${secretResolution.path})` : ''}`);
        ensureCertificates();
        const { cert, key } = loadCertificates();
        const state = new SweetLinkState(secretResolution.secret);
        const server = createHttpsServer({ key, cert }, (req, res) => {
            void handleHttpRequest(state, req, res);
        });
        const wsServer = new WebSocketServer({ server, path: SWEETLINK_WS_PATH });
        wsServer.on('connection', (socket) => state.handleSocket(socket));
        server.listen(port, '127.0.0.1', () => {
            log(`SweetLink daemon listening on https://localhost:${port}`);
            log(`WebSocket endpoint ready at wss://localhost:${port}${SWEETLINK_WS_PATH}`);
            log('Press Ctrl+C to stop.');
        });
        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        function shutdown(signal) {
            log(`Received ${signal}, shutting down SweetLink daemon...`);
            wsServer.close();
            server.close(() => process.exit(0));
            const shutdownTimer = setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS);
            unrefTimer(shutdownTimer);
        }
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`SweetLink daemon failed to start: ${message}`);
        process.exitCode = 1;
    }
}
async function isDaemonAlreadyRunning(port) {
    return await new Promise((resolve) => {
        const request = httpsRequest({
            hostname: '127.0.0.1',
            port,
            path: '/healthz',
            method: 'GET',
            rejectUnauthorized: false,
            timeout: 750,
        }, (response) => {
            response.resume();
            resolve(response.statusCode === 200);
        });
        request.on('error', () => resolve(false));
        request.on('timeout', () => {
            request.destroy();
            resolve(false);
        });
        request.end();
    });
}
class SweetLinkState {
    constructor(secret) {
        _SweetLinkState_instances.add(this);
        _SweetLinkState_secret.set(this, void 0);
        _SweetLinkState_sessions.set(this, new Map());
        __classPrivateFieldSet(this, _SweetLinkState_secret, secret, "f");
        const expiryInterval = setInterval(() => __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_expireStaleSessions).call(this), SWEETLINK_HEARTBEAT_INTERVAL_MS);
        unrefTimer(expiryInterval);
    }
    verifyCliToken(token) {
        return verifySweetLinkToken({ secret: __classPrivateFieldGet(this, _SweetLinkState_secret, "f"), token, expectedScope: 'cli' });
    }
    handleSocket(socket) {
        let sessionId = null;
        socket.on('message', (data) => {
            try {
                const raw = decodeSocketPayload(data);
                const message = JSON.parse(raw);
                if (!message || typeof message !== 'object') {
                    throw new Error('Invalid client message');
                }
                switch (message.kind) {
                    case 'register': {
                        sessionId = __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_handleRegister).call(this, socket, message);
                        break;
                    }
                    case 'heartbeat': {
                        __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_touchSession).call(this, message.sessionId);
                        break;
                    }
                    case 'commandResult': {
                        __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_handleCommandResult).call(this, message.sessionId, message.result);
                        break;
                    }
                    case 'console': {
                        __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_handleConsoleEvents).call(this, message.sessionId, message.events);
                        break;
                    }
                    default: {
                        throw new Error(`Unknown client message: ${message.kind ?? 'unknown'}`);
                    }
                }
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`SweetLink socket error: ${message}`);
            }
        });
        socket.once('close', (code, reasonBuffer) => {
            if (sessionId) {
                const reasonText = reasonBuffer?.toString?.('utf8') ?? '';
                const closeDetail = reasonText && reasonText.length > 0 ? `socket closed (${code}: ${reasonText})` : `socket closed (${code})`;
                __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_removeSession).call(this, sessionId, closeDetail);
            }
        });
    }
    listSessions() {
        const now = Date.now();
        return [...__classPrivateFieldGet(this, _SweetLinkState_sessions, "f").values()].map((entry) => {
            const consoleEventsBuffered = entry.consoleBuffer.length;
            let consoleErrorsBuffered = 0;
            for (const event of entry.consoleBuffer) {
                if (event.level === 'error') {
                    consoleErrorsBuffered += 1;
                }
            }
            const lastConsoleEventAt = entry.lastConsoleEventAt ?? null;
            return {
                sessionId: entry.metadata.sessionId,
                codename: entry.metadata.codename,
                url: entry.metadata.url,
                title: entry.metadata.title,
                topOrigin: entry.metadata.topOrigin,
                createdAt: entry.metadata.createdAt,
                lastSeenAt: entry.lastHeartbeat,
                heartbeatMsAgo: Math.max(0, now - entry.lastHeartbeat),
                consoleEventsBuffered,
                consoleErrorsBuffered,
                pendingCommandCount: entry.pending.size,
                socketState: __classPrivateFieldGet(this, _SweetLinkState_instances, "m", _SweetLinkState_socketStateToString).call(this, entry.socket.readyState),
                userAgent: entry.metadata.userAgent,
                lastConsoleEventAt,
            };
        });
    }
    async sendCommand(sessionId, rawCommand, timeoutMs = 15000) {
        const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
        if (!session) {
            throw new Error('Session not found or offline');
        }
        if (session.socket.readyState !== WebSocket.OPEN) {
            throw new Error('Session socket is not open');
        }
        const commandId = createSweetLinkCommandId();
        const command = { ...rawCommand, id: commandId };
        const payload = {
            kind: 'command',
            sessionId: session.metadata.sessionId,
            command,
        };
        const serialized = JSON.stringify(payload);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                session.pending.delete(commandId);
                reject(new Error('Command timed out'));
            }, timeoutMs);
            session.pending.set(commandId, {
                commandId,
                resolve: (result) => {
                    clearTimeout(timeout);
                    resolve(result);
                },
                reject: (error) => {
                    clearTimeout(timeout);
                    reject(error);
                },
                timeout,
            });
            session.socket.send(serialized, (sendError) => {
                if (sendError) {
                    clearTimeout(timeout);
                    session.pending.delete(commandId);
                    reject(sendError);
                }
            });
        });
    }
    getSessionConsole(sessionId) {
        const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
        return session ? [...session.consoleBuffer] : [];
    }
}
_SweetLinkState_secret = new WeakMap(), _SweetLinkState_sessions = new WeakMap(), _SweetLinkState_instances = new WeakSet(), _SweetLinkState_handleRegister = function _SweetLinkState_handleRegister(socket, message) {
    const token = message.token;
    const sessionId = message.sessionId;
    const payload = verifySweetLinkToken({ secret: __classPrivateFieldGet(this, _SweetLinkState_secret, "f"), token, expectedScope: 'session' });
    if (!payload.sessionId || payload.sessionId !== sessionId) {
        throw new Error('Session token mismatch');
    }
    const metadata = {
        sessionId,
        userAgent: message.userAgent,
        url: message.url,
        title: message.title,
        topOrigin: message.topOrigin,
        codename: generateSessionCodename(Array.from(__classPrivateFieldGet(this, _SweetLinkState_sessions, "f").values(), (session) => session.metadata.codename)),
        createdAt: Date.now(),
    };
    const existing = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
    if (existing) {
        existing.socket.terminate();
        __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").delete(sessionId);
    }
    const entry = {
        metadata,
        socket,
        lastHeartbeat: Date.now(),
        consoleBuffer: [],
        pending: new Map(),
        lastConsoleEventAt: null,
    };
    __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").set(sessionId, entry);
    try {
        const metadataMessage = {
            kind: 'metadata',
            sessionId,
            codename: metadata.codename,
        };
        socket.send(JSON.stringify(metadataMessage));
        log(`Sent metadata for session ${sessionId} [${metadata.codename}]`);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[SweetLink] Failed to send session metadata for ${sessionId}: ${message}`);
    }
    log(`Registered SweetLink session ${sessionId} [${metadata.codename}] (${metadata.title || metadata.url})`);
    return sessionId;
}, _SweetLinkState_touchSession = function _SweetLinkState_touchSession(sessionId) {
    const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
    if (session) {
        session.lastHeartbeat = Date.now();
    }
}, _SweetLinkState_handleCommandResult = function _SweetLinkState_handleCommandResult(sessionId, result) {
    const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
    if (!session) {
        return;
    }
    const pending = session.pending.get(result.commandId);
    if (!pending) {
        return;
    }
    session.pending.delete(result.commandId);
    pending.resolve(result);
}, _SweetLinkState_handleConsoleEvents = function _SweetLinkState_handleConsoleEvents(sessionId, events) {
    const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
    if (!session || !events?.length) {
        return;
    }
    session.consoleBuffer.push(...events);
    if (session.consoleBuffer.length > 200) {
        session.consoleBuffer.splice(0, session.consoleBuffer.length - 200);
    }
    const lastEvent = events.at(-1);
    if (lastEvent) {
        session.lastConsoleEventAt = lastEvent.timestamp ?? Date.now();
    }
}, _SweetLinkState_socketStateToString = function _SweetLinkState_socketStateToString(readyState) {
    return SOCKET_STATE_LABEL[readyState] ?? 'unknown';
}, _SweetLinkState_removeSession = function _SweetLinkState_removeSession(sessionId, reason) {
    const session = __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").get(sessionId);
    if (!session) {
        return;
    }
    __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").delete(sessionId);
    for (const pending of session.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`Session ended before command completed: ${reason}`));
    }
    log(`Session ${sessionId} [${session.metadata.codename}] disconnected (${reason})`);
}, _SweetLinkState_expireStaleSessions = function _SweetLinkState_expireStaleSessions() {
    const now = Date.now();
    for (const session of __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").values()) {
        if (now - session.lastHeartbeat > SWEETLINK_HEARTBEAT_TOLERANCE_MS) {
            session.socket.terminate();
            __classPrivateFieldGet(this, _SweetLinkState_sessions, "f").delete(session.metadata.sessionId);
            log(`Session ${session.metadata.sessionId} [${session.metadata.codename}] expired due to missed heartbeats`);
        }
    }
};
async function handleHttpRequest(state, req, res) {
    const basePort = sweetLinkEnv.port;
    const requestUrl = req.url ? new URL(req.url, `https://localhost:${basePort}`) : null;
    if (!requestUrl) {
        respondJson(res, 400, { error: 'Invalid request URL' });
        return;
    }
    if (req.method === 'OPTIONS') {
        respondCors(res);
        return;
    }
    if (requestUrl.pathname === '/healthz') {
        respondJson(res, 200, { status: 'ok' });
        return;
    }
    const authorization = req.headers.authorization;
    if (!authorization?.startsWith('Bearer ')) {
        respondJson(res, 401, { error: 'Missing SweetLink token' });
        return;
    }
    try {
        const token = authorization.slice('Bearer '.length).trim();
        state.verifyCliToken(token);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        respondJson(res, 401, { error: message });
        return;
    }
    if (req.method === 'GET' && requestUrl.pathname === '/sessions') {
        const sessions = state.listSessions();
        respondJson(res, 200, { sessions });
        return;
    }
    if (req.method === 'GET' &&
        requestUrl.pathname.startsWith('/sessions/') &&
        requestUrl.pathname.endsWith('/console')) {
        const sessionId = requestUrl.pathname.split('/')[2];
        if (sessionId == null) {
            respondJson(res, 400, { error: 'Session id missing' });
            return;
        }
        const events = state.getSessionConsole(sessionId);
        respondJson(res, 200, { sessionId, events });
        return;
    }
    if (req.method === 'POST' &&
        requestUrl.pathname.startsWith('/sessions/') &&
        requestUrl.pathname.endsWith('/command')) {
        const sessionId = requestUrl.pathname.split('/')[2];
        if (sessionId == null) {
            respondJson(res, 400, { error: 'Session id missing' });
            return;
        }
        try {
            const body = (await readJson(req));
            if (!body?.type) {
                throw new Error('Command type is required');
            }
            const { timeoutMs, ...commandFields } = body;
            const command = commandFields;
            const result = await state.sendCommand(sessionId, command, timeoutMs ?? 15000);
            respondJson(res, 200, { result });
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            respondJson(res, 400, { error: message });
        }
        return;
    }
    respondJson(res, 404, { error: 'Not Found' });
}
async function readJson(req) {
    const chunks = [];
    for await (const chunk of req) {
        const bufferChunk = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
        chunks.push(bufferChunk);
    }
    if (chunks.length === 0) {
        return {};
    }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!text) {
        return {};
    }
    return JSON.parse(text);
}
function respondJson(res, status, body) {
    const payload = JSON.stringify(body ?? {}, null, 2);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.end(payload);
}
function respondCors(res) {
    res.statusCode = 204;
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.end();
}
function decodeSocketPayload(data) {
    if (typeof data === 'string') {
        return data;
    }
    if (Buffer.isBuffer(data)) {
        return data.toString('utf8');
    }
    if (Array.isArray(data)) {
        const buffers = data.map((chunk) => (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        return Buffer.concat(buffers).toString('utf8');
    }
    if (ArrayBuffer.isView(data)) {
        const view = data;
        return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
    }
    if (data instanceof ArrayBuffer) {
        return Buffer.from(data).toString('utf8');
    }
    return Buffer.from([]).toString('utf8');
}
function ensureCertificates() {
    if (existsSync(CERT_PATH) && existsSync(KEY_PATH)) {
        return;
    }
    log('Generating SweetLink TLS certificates via mkcert...');
    mkdirSync(CERT_DIR, { recursive: true });
    const mkcertLookup = spawnSync('which', ['mkcert'], { stdio: 'pipe' });
    if (mkcertLookup.status !== 0) {
        const secretPath = getDefaultSweetLinkSecretPath();
        throw new Error('mkcert is required but not found. Install via "brew install mkcert nss" and rerun pnpm sweetlink. ' +
            `Generated SweetLink secret saved at ${secretPath}.`);
    }
    const install = spawnSync('mkcert', ['-install'], { stdio: 'inherit' });
    if (install.status !== 0) {
        throw new Error('Failed to run mkcert -install');
    }
    const create = spawnSync('mkcert', ['-cert-file', CERT_PATH, '-key-file', KEY_PATH, 'localhost', '127.0.0.1', '::1'], { stdio: 'inherit' });
    if (create.status !== 0) {
        throw new Error('Failed to generate mkcert certificates');
    }
}
function loadCertificates() {
    const cert = readFileSync(CERT_PATH);
    const key = readFileSync(KEY_PATH);
    return { cert, key };
}
function log(message) {
    console.log(`[SweetLink] ${message}`);
}
try {
    await main();
}
catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SweetLink] Daemon failed: ${message}`);
    process.exit(1);
}
//# sourceMappingURL=index.js.map