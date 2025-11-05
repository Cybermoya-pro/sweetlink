import { createHmac, randomUUID } from 'node:crypto';
import { sweetLinkEnv } from '@sweetistics/sweetlink-shared/env';
import { resolveSweetLinkSecret } from '@sweetistics/sweetlink-shared/node';

export interface SweetLinkHandshakePayload {
  readonly sessionId: string;
  readonly sessionToken: string;
  readonly socketUrl: string;
  readonly expiresAt: number;
  readonly secretSource: string;
}

const SWEETLINK_SESSION_EXP_SECONDS = 60 * 5;
const SWEETLINK_WS_PATH = '/bridge';

function resolveDaemonUrl(): string {
  return sweetLinkEnv.daemonUrl;
}

function signSweetLinkToken(options: { secret: string; subject: string; sessionId: string; ttlSeconds: number }) {
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

export async function issueSweetLinkHandshake(): Promise<SweetLinkHandshakePayload> {
  const secretResolution = await resolveSweetLinkSecret({
    autoCreate: true,
    secretPath: sweetLinkEnv.secretPath,
  });
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
