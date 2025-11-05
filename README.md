# SweetLink 🍭

SweetLink is the agent-ready way to "connect your agent to your web app. Like Playwright, but it works in your current tab. Close the loop." It drives a real browser session through the SweetLink daemon so you can authenticate, capture screenshots, run smoke tests, and gather DevTools telemetry without wiring up a headless automation stack.

> **Note:** This README is the canonical copy. When updating docs for the public `steipete/sweetlink` repository, edit here first and then sync the changes.

## Features

- **Session management** – list active sessions, inspect console/network buffers, and reconnect after hot reloads.
- **Controlled Chrome launch** – spin up a DevTools-enabled browser, sync cookies from your main profile, and auto-approve the Twitter OAuth consent flow.
- **Smoke tests** – sweep configurable route presets (dashboard, reports, search, billing, settings) and flag authentication or runtime errors.
- **Screenshots & selectors** – capture JPEGs via Puppeteer/HTML renderers and discover DOM selectors for automation.
- **DevTools telemetry** – stream console/network logs to disk, dump diagnostics when a session fails to register, and click the OAuth authorize button on demand.

## Prerequisites

- Node.js 22+
- `pnpm` (managed via Corepack)
- TLS requirements: `brew install mkcert nss`
- SweetLink daemon (`pnpm sweetlink:daemon`) running locally

## Installation

Standalone checkout:

```bash
pnpm install
```

Monorepo users should follow the Sweetistics setup in `apps/sweetlink/README.md` before mirroring changes back into this repository.

## Usage

```bash
pnpm sweetlink --help
```

Common workflows:

- `pnpm sweetlink open --controlled --path /dashboard` – launch/reuse the controlled Chrome window.
- `pnpm sweetlink open --url http://localhost:4100/dashboard` – target a non-default host/port for one-off runs.
- `pnpm sweetlink sessions` – view active sessions (codename, heartbeat, socket state, buffered console errors).
- `pnpm sweetlink smoke --routes main` – sweep the configured dashboard/search/settings routes.
- `pnpm sweetlink devtools authorize` – force-click the OAuth consent button when Twitter prompts.

When a session fails to register, the CLI emits a DevTools snapshot and Puppeteer scrape (overlay/body text) so build/runtime errors surface immediately.

## Architecture

SweetLink consists of two cooperating pieces:

- **CLI** – a Node.js client that parses your commands (`open`, `smoke`, `sessions`, etc.), reads `sweetlink.json`, and establishes a control session with your browser.
- **Daemon** – a long-lived service (`pnpm sweetlink:daemon`) that launches or attaches to a DevTools-enabled Chrome instance, forwards console/network telemetry, and executes remote evaluations on behalf of the CLI.

The typical flow looks like this:

1. Start the daemon once per workstation. It spins up (or reconnects to) Chromium with the remote debugging port exposed and registers a secure WebSocket endpoint.
2. Running `pnpm sweetlink open --controlled` prompts the CLI to locate `sweetlink.json`, resolve runtime defaults (hosts, smoke routes, OAuth automation scripts), and request a session token from the daemon using your admin key.
3. The daemon launches the controlled browser window (or reuses the existing one), hydrates it with cookies from your configured `cookieMappings`, and signals the CLI when the target page is healthy (`healthChecks.paths` + optional `servers` checks).
4. Commands like `sweetlink smoke` or `sweetlink devtools authorize` stream instructions to the daemon. The daemon executes them via DevTools Protocol or Puppeteer, shipping back console output, screenshots, and failure diagnostics in real time.
5. When the CLI exits, the daemon keeps the browser alive so the next command can reuse the authenticated context; run `pnpm sweetlink sessions` to inspect or detach lingering sessions.

Because the CLI and daemon communicate over secure WebSockets, you can run the daemon locally or on a remote VM. Set `daemonUrl` in `sweetlink.json` (or `SWEETLINK_DAEMON_URL`) to tunnel to the remote instance while keeping the same CLI workflows.

## Configuration

SweetLink resolves defaults from (highest priority first):

1. CLI flags (e.g. `--url`, `--app-url`, `--daemon-url`, `--port`)
2. `sweetlink.json` (or `sweetlink.config.json`) located in or above the current working directory (SweetLink walks up parent directories until it finds one)
3. Environment variables (`SWEETLINK_APP_URL`, `SWEETLINK_DAEMON_URL`, `SWEETLINK_PROD_URL`)
4. Fallback `http://localhost:3000`

Start by copying `sweetlink.example.json` from the repo root. It ships with a neutral baseline config. Place the file in your project root (or any parent directory). With the file in place, `pnpm sweetlink open --controlled --foreground` will automatically point at `http://localhost:4100` unless an explicit `--url`/`--app-url` is provided. The CLI also exposes `--port` to temporarily rewrite the local host port without editing JSON. `healthChecks.paths` lets you point the readiness probe at specific endpoints (for example `/api/health`). `cookieMappings` declares extra origins to harvest cookies from (such as OAuth provider cookies when you reuse a signed-in Chrome profile). `smokeRoutes.defaults` overrides the built-in route sweep, and `smokeRoutes.presets` lets you register new comma-delimited shortcuts (the built-ins `main`, `settings`, `billing-only`, and `pulse-only` remain available). Hosts accept plain domains or wildcard-prefixed entries (`*.example.dev`), and origins must be fully-qualified URLs.

SweetLink reads the config once at start-up. When you edit `sweetlink.json` rerun the CLI command to pick up the new defaults. Multiple projects on the same machine can keep their own configs; SweetLink stops at the first file it finds while walking up the directory tree, so place project-specific configs as close to the repo root as possible.

### OAuth automation scripts

Specify an automation helper through config (`oauthScript`), the `--oauth-script` flag, or `SWEETLINK_OAUTH_SCRIPT`. The script receives a `SweetLinkOauthAuthorizeContext` with DevTools and Puppeteer helpers so you can programmatically approve OAuth prompts. A ready-to-use Twitter/X implementation lives at `examples/oauth/twitter-oauth-automation.ts`.

Each automation module exports a single async function:

```ts
import type { SweetLinkOauthAutomation } from '@sweetlink/cli';

const automation: SweetLinkOauthAutomation = {
  async authorize(context) {
    // use context.fetchTabs / context.evaluateInDevToolsTab / context.connectPuppeteer
    // to locate and click the consent button
    return { handled: false, reason: 'button-not-found' };
  },
};

export default automation;
```

### Example App

Looking for a minimal integration? Launch the demo web app under `examples/basic-web`:

```bash
pnpm --filter @sweetlink/example-basic-web dev
```

The Vite dev server auto-reloads whenever you tweak the example UI. The site exposes a single page with an “Enable SweetLink” button. Clicking it calls the included `/api/sweetlink/handshake` route, registers with your locally running daemon, and keeps the socket alive so you can attach via `pnpm sweetlink console demo`. The example bundles a small browser client that handles the `register`, `heartbeat`, and `runScript` command flow so you can verify end-to-end behaviour without touching your production app. A status chip at the top of the page shows the active SweetLink codename so developers can confirm which CLI session is currently linked.

Once attached, experiment with commands such as:

- `pnpm sweetlink run-js demo --code "demo.updateKpi(87)"`
- `pnpm sweetlink run-js demo --code "demo.toggleBadge()"`
- `pnpm sweetlink screenshot demo --selector "#screenshot-card"`

The demo exposes helpers on `window.demo` so you can script UI tweaks before grabbing screenshots.

## Local Checks

```bash
pnpm run lint
pnpm run test
pnpm run build
```

## License

SweetLink (CLI, daemon, and shared packages) is licensed under the MIT License. See `LICENSE` for the full text.
