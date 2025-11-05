import { createSweetLinkSessionId, SWEETLINK_SESSION_EXP_SECONDS, SWEETLINK_WS_PATH, signSweetLinkToken, } from '@sweetistics/sweetlink-shared';
import { sweetLinkEnv } from '@sweetistics/sweetlink-shared/env';
import { resolveSweetLinkSecret } from '@sweetistics/sweetlink-shared/node';
export async function issueSweetLinkHandshake() {
    const secretResolution = await resolveSweetLinkSecret({ autoCreate: true });
    const sessionId = createSweetLinkSessionId();
    const sessionToken = signSweetLinkToken({
        secret: secretResolution.secret,
        scope: 'session',
        subject: 'sweetlink-example',
        ttlSeconds: SWEETLINK_SESSION_EXP_SECONDS,
        sessionId,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + SWEETLINK_SESSION_EXP_SECONDS;
    const socketUrl = `${sweetLinkEnv.daemonUrl}${SWEETLINK_WS_PATH}`;
    return {
        sessionId,
        sessionToken,
        socketUrl,
        expiresAt,
        secretSource: secretResolution.source,
    };
}
