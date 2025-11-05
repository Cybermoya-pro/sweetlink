import { createHmac, randomUUID } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const SWEETLINK_SESSION_EXP_SECONDS = 60 * 5;
const SWEETLINK_WS_PATH = '/bridge';
const DEFAULT_SECRET_PATH = path.join(os.homedir(), '.sweetlink', 'secret.key');
function resolveDaemonUrl() {
    const daemonUrl = process.env.SWEETLINK_DAEMON_URL;
    if (daemonUrl && daemonUrl.trim().length > 0) {
        return daemonUrl.trim();
    }
    const port = Number(process.env.SWEETLINK_PORT ?? '4455');
    const safePort = Number.isFinite(port) && port > 0 ? port : 4455;
    return `https://localhost:${safePort}`;
}
async function resolveSweetLinkSecret() {
    const envSecret = process.env.SWEETLINK_SECRET;
    if (envSecret && envSecret.length >= 32) {
        return { secret: envSecret, source: 'env' };
    }
    const secretPath = process.env.SWEETLINK_SECRET_PATH ?? DEFAULT_SECRET_PATH;
    try {
        const contents = await readFile(secretPath, 'utf8');
        const trimmed = contents.trim();
        if (trimmed.length >= 32) {
            return { secret: trimmed, source: 'file', path: secretPath };
        }
    }
    catch (error) {
        if (error?.code !== 'ENOENT') {
            // eslint-disable-next-line no-console -- demo diagnostics
            console.warn('Unable to read SweetLink secret, generating a new one.', error);
        }
    }
    const generated = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
    const dir = path.dirname(secretPath);
    await mkdir(dir, { recursive: true });
    await writeFile(secretPath, `${generated}\n`, { mode: fsConstants.S_IRUSR | fsConstants.S_IWUSR });
    return { secret: generated, source: 'generated', path: secretPath };
}
function signSweetLinkToken(options) {
    const issuedAt = Math.floor(Date.now() / 1000);
    const payload = {
        tokenId: randomUUID(),
        scope: 'session',
        sub: options.subject,
        sessionId: options.sessionId,
        issuedAt,
        expiresAt: issuedAt + options.ttlSeconds,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = createHmac('sha256', options.secret).update(encodedPayload).digest('base64url');
    return `${encodedPayload}.${signature}`;
}
export async function issueSweetLinkHandshake() {
    const secretResolution = await resolveSweetLinkSecret();
    const sessionId = randomUUID();
    const sessionToken = signSweetLinkToken({
        secret: secretResolution.secret,
        subject: 'sweetlink-example',
        ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS,
        sessionId,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + SWEETLINK_SESSION_EXP_SECONDS;
    const socketUrl = `${resolveDaemonUrl()}${SWEETLINK_WS_PATH}`;
    return {
        sessionId,
        sessionToken,
        socketUrl,
        expiresAt,
        secretSource: secretResolution.source,
    };
}
