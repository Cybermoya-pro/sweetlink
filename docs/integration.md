---
summary: 'How the Sweetistics web app wires in SweetLink and how to replicate the pattern elsewhere.'
read_when:
  - integrating the SweetLink CLI/daemon into a web app
  - surfacing SweetLink session status inside a UI
---

# Integrating SweetLink Into Your Web App

SweetLink ships with a standalone CLI/daemon pair, but you still need a few browser hooks and an API route to complete the loop inside your app. The Sweetistics frontend uses the pattern below; feel free to adapt it to your stack.

## 1. Bootstrap SweetLink on the client

Add a tiny client component near the root of your tree that listens for the CLI’s activation signals and kicks off the browser-side handshake:

- On mount, watch for:
  - The `sweetlink:auto` sessionStorage flag (set by the CLI when it opens your site).
  - The `sweetlink:cli-auto` DOM event (emitted by manual menu actions such as “Enable SweetLink”).
- When triggered, lazy-import `ensureSweetLinkSession` from the snippet below and call it. That helper:
  - Resumes a cached session if the CLI already linked.
  - Falls back to the backend handshake (see next section) to mint a fresh token.
  - Copies a friendly summary (session ID + codename) to the clipboard.
  - Cleans up the `?sweetlink=auto` query string.

Here’s a minimal hook you can drop into your project (`hooks/useSweetLinkAutoBootstrap.ts`):

```ts
'use client';

import { useEffect } from 'react';

export function useSweetLinkAutoBootstrap(): void {
  useEffect(() => {
    const win = typeof window === 'undefined' ? null : window;
    if (!win) {
      return;
    }

    const setFlag = () => {
      try {
        win.sessionStorage.setItem('sweetlink:auto', 'pending');
      } catch {
        /* ignore */
      }
    };

    const clearFlag = () => {
      try {
        win.sessionStorage.removeItem('sweetlink:auto');
      } catch {
        /* ignore */
      }
    };

    const hasFlag = () => {
      try {
        return win.sessionStorage.getItem('sweetlink:auto') === 'pending';
      } catch {
        return false;
      }
    };

    let inFlight = false;
    const ensureSession = async () => {
      setFlag();
      if (inFlight) {
        return;
      }
      inFlight = true;
      try {
        const { ensureSweetLinkSession } = await import('../sweetlink/activate');
        await ensureSweetLinkSession({ copyToClipboard: false });
      } finally {
        inFlight = false;
        clearFlag();
      }
    };

    const handleEvent = () => {
      void ensureSession();
    };

    const url = new URL(win.location.href);
    if (url.searchParams.get('sweetlink') === 'auto' || hasFlag()) {
      void ensureSession();
    }

    win.addEventListener('sweetlink:cli-auto', handleEvent);
    return () => {
      win.removeEventListener('sweetlink:cli-auto', handleEvent);
    };
  }, []);
}
```

Pair the hook with a lightweight activation helper (`sweetlink/activate.ts`) that requests the handshake and caches active sessions. This mirrors the Sweetistics implementation but trims out app-specific details:

```ts
// sweetlink/activate.ts

interface SweetLinkSessionBootstrap {
  sessionId: string;
  sessionToken: string;
  socketUrl: string;
  expiresAt?: number | null;
  codename?: string | null;
}

let activationPromise: Promise<void> | null = null;

export async function ensureSweetLinkSession(options: { copyToClipboard?: boolean } = {}): Promise<void> {
  if (activationPromise) {
    return activationPromise;
  }
  activationPromise = activate(options);
  try {
    await activationPromise;
  } finally {
    activationPromise = null;
  }
}

async function activate(options: { copyToClipboard?: boolean }): Promise<void> {
  const response = await fetch('/api/admin/sweetlink/remote-handshake', { method: 'POST' });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SweetLink handshake failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as SweetLinkSessionBootstrap;
  await startSweetLinkSession(payload);

  if (options.copyToClipboard !== false) {
    await maybeCopyToClipboard(payload);
  }
}

async function startSweetLinkSession(session: SweetLinkSessionBootstrap): Promise<void> {
  const socket = new WebSocket(session.socketUrl, ['sweetlink']);
  socket.onerror = (error) => {
    console.error('SweetLink websocket error', error);
  };
  socket.onopen = () => {
    socket.send(
      JSON.stringify({
        kind: 'register',
        token: session.sessionToken,
        sessionId: session.sessionId,
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        topOrigin: window.location.origin,
      })
    );
  };
}

async function maybeCopyToClipboard(session: SweetLinkSessionBootstrap): Promise<void> {
  try {
    const codename = session.codename?.trim();
    const attachCommand = codename
      ? `pnpm sweetlink console ${codename}`
      : `pnpm sweetlink console ${session.sessionId}`;
    await navigator.clipboard.writeText([attachCommand, `Session ID: ${session.sessionId}`].join('\n'));
    console.info('SweetLink session ready – details copied to clipboard.');
  } catch (error) {
    console.warn('Failed to copy SweetLink session info', error);
  }
}
```

## 2. Implement the handshake endpoint

The CLI expects an HTTP endpoint that returns a websocket token and URL for the daemon. The snippet below mirrors the handler used inside the Sweetistics web app (Next.js route). Adjust import paths to match your project structure:

```ts
import {
  createSweetLinkSessionId,
  SWEETLINK_SESSION_EXP_SECONDS,
  SWEETLINK_WS_PATH,
  signSweetLinkToken,
} from '@sweetlink/shared';
import { sweetLinkEnv } from '@sweetlink/shared/env';
import { resolveSweetLinkSecret } from '@sweetlink/shared/node';
import { NextResponse } from 'next/server';

export async function POST() {
  const secretResolution = await resolveSweetLinkSecret({ autoCreate: !sweetLinkEnv.isProduction });
  const sessionId = createSweetLinkSessionId();
  const ttlSeconds = SWEETLINK_SESSION_EXP_SECONDS;

  const token = signSweetLinkToken({
    secret: secretResolution.secret,
    scope: 'session',
    subject: 'sweetlink-web',
    ttlSeconds,
    sessionId,
  });

  const port = sweetLinkEnv.port;
  const socketUrl = `wss://localhost:${String(port)}${SWEETLINK_WS_PATH}`;
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;

  return NextResponse.json({
    sessionId,
    sessionToken: token,
    socketUrl,
    expiresAt,
    codename: null,
  });
}
```

Protect the route in production (e.g., wrap it with your admin auth middleware) and log the request for auditability when helpful.

## 3. Surface session status in the UI

SweetLink exposes the active session metadata via websocket messages. On the client:

- Maintain a `SweetLinkStatusSnapshot` object on `window.__sweetlinkStatusSnapshot`.
- Emit a `sweetlink:status` event whenever the session state changes. Attach payload `{ status, reason, codename }`.
- Build a `useSweetLinkStatus` hook with `useSyncExternalStore` so React components can subscribe to that event.

With the hook in place, you can display the session codename in an admin menu, show errors when the CLI disconnects, or render an “Enable SweetLink” button that reruns the bootstrap flow:

```tsx
const { status, codename, reason } = useSweetLinkStatus();

return (
  <Button onClick={handleEnableSweetLink}>
    {status === 'connected' && codename ? `SweetLink: ${codename}` : 'Enable SweetLink'}
  </Button>
);
```

Ensure `handleEnableSweetLink` dispatches `new CustomEvent('sweetlink:cli-auto')` or directly calls `ensureSweetLinkSession()` so the CLI reattaches.

## 4. Optional: share the daemon certificate

SweetLink stores the mkcert-generated certificate/key under `~/.sweetlink/certs`. All projects on the same machine reuse that directory. Document this for your team so they know:

- Run `pnpm sweetlink trust-ca` once to install the mkcert CA.
- Visit `https://localhost:4455` in each browser profile they plan to automate and accept the warning.

The provided `examples/basic-web` app includes a TLS banner that opens the certificate URL and retries the check—use that as inspiration if you need a guided flow.

## Putting it together

1. Add the auto-bootstrap component and hook.
2. Create the handshake endpoint that mints signed tokens.
3. Broadcast status snapshots and display them in your UI.
4. Document the TLS trust steps for your team.

With those pieces in place, the `sweetlink` CLI can launch the daemon, open your app, and show contributors exactly which session (“paper-dolphin”) they’re attached to—just like the Sweetistics integration.
