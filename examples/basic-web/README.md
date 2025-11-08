# SweetLink Basic Web Example

This demo shows how a plain web page can bootstrap a SweetLink session and talk to the local daemon.

## Prerequisites

- SweetLink daemon running locally (`pnpm sweetlink:daemon`)
- mkcert certificates installed/trusted (same requirement as the CLI)

## Running the demo

```bash
pnpm --filter @sweetlink/example-basic-web dev
```

The Vite dev server reloads automatically whenever you edit `src/main.ts` or `index.html`. Open `http://localhost:4000` and click **Enable SweetLink**. The page will:

1. POST to `/api/sweetlink/handshake` to request a session token.
2. Pass the payload to `createSweetLinkClient` from `sweetlink/runtime/browser`, which connects to the local daemon, patches the console, and keeps the session alive automatically.

With the session active, try `pnpm sweetlink sessions` or `pnpm sweetlink console demo` in another terminal to interact with the page.

### Sample CLI Commands

| Action | Command |
| --- | --- |
| Update KPI badge | `pnpm sweetlink run-js demo --code "demo.updateKpi(87)"` |
| Toggle feature badge | `pnpm sweetlink run-js demo --code "demo.toggleBadge()"` |
| Pulse screenshot card | `pnpm sweetlink run-js demo --code "demo.pulseCard()"` |
| Randomize chart bars | `pnpm sweetlink run-js demo --code "demo.randomizeChart()"` |
| Capture screenshot card | `pnpm sweetlink screenshot demo --selector "#screenshot-card"` |

All helpers live on `window.demo` for convenience. You can also click the “Pulse Animation” button locally to simulate UI changes before taking a screenshot.

To run the production bundle locally:

```bash
pnpm --filter @sweetlink/example-basic-web build
pnpm --filter @sweetlink/example-basic-web start
```

This compiles the Express server (under `dist/server`) and serves the Vite output from `dist/client`.

## Production Notes

This example intentionally keeps things simple:

- Secrets are generated locally via `resolveSweetLinkSecret({ autoCreate: true })`. Point the helper at your own key management flow before deploying.
- The browser imports `createSweetLinkClient` / `createSessionStorageAdapter` directly from `sweetlink/runtime/browser`, so you can copy that snippet into any framework.
- The runtime now handles every command SweetLink supports (runScript, navigate, screenshots, selector discovery, console streaming). Your app only needs to implement the handshake endpoint and adopt whatever UI makes sense for operators.

Adapt the handshake route and status wiring to match your security and UX requirements before deploying to production.
