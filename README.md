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

- Node.js 20+
- `pnpm` (managed via Corepack)
- TLS requirements: `brew install mkcert nss`
- SweetLink daemon (`apps/sweetlink/daemon`) running locally or via `pnpm sweetlink:daemon`

## Installation

From the monorepo:

```bash
pnpm install
pnpm --filter @sweetlink/cli run build
```

Standalone checkout:

```bash
cd ~/Projects/sweetlink
pnpm install
```

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

When a session fails to register, the CLI now emits a DevTools snapshot and Puppeteer scrape (overlay/body text) so build/runtime errors surface immediately.

## Configuration

### Generic usage

SweetLink resolves defaults from (highest priority first):

1. CLI flags (e.g. `--url`, `--app-url`, `--daemon-url`, `--port`)
2. `sweetlink.json` (or `sweetlink.config.json`) located in or above the current working directory (SweetLink walks up parent directories until it finds one)
3. Environment variables (`SWEETLINK_APP_URL`, `SWEETLINK_DAEMON_URL`, `SWEETLINK_PROD_URL`)
4. Fallback `http://localhost:3000`

Start by copying `sweetlink.example.json` from the repo root. It ships with a neutral baseline config:

```json
{
  "appUrl": "http://localhost:4100",
  "prodUrl": "https://demo.acme.app",
  "daemonUrl": "https://localhost:4455",
  "port": 4100,
  "healthChecks": {
    "paths": ["/api/health"]
  },
  "cookieMappings": [
    {
      "hosts": ["example.dev", "*.example.dev", "localhost", "127.0.0.1"],
      "origins": [
        "https://app.example.dev",
        "https://auth.example.dev",
        "https://api.example.dev"
      ]
    }
  ]
}
```

Place the config file in your project root (or any parent directory). With the file in place, `pnpm sweetlink open --controlled --foreground` will automatically point at `http://localhost:4100` unless an explicit `--url`/`--app-url` is provided. The CLI also exposes `--port` to temporarily rewrite the local host port without editing the JSON file. `healthChecks.paths` lets you point the readiness probe at specific endpoints (for example `/api/health`). `cookieMappings` declares extra origins to harvest cookies from (such as OAuth provider cookies when you reuse a signed-in Chrome profile). `smokeRoutes.defaults` overrides the built-in route sweep, and `smokeRoutes.presets` lets you register new comma-delimited shortcuts (the built-ins `main`, `settings`, `billing-only`, and `pulse-only` remain available). Hosts accept plain domains or wildcard-prefixed entries (`*.example.dev`), and origins must be fully-qualified URLs. Omit `daemonUrl`, `prodUrl`, `healthChecks`, `smokeRoutes`, or `cookieMappings` to keep SweetLink’s defaults for those targets.

### Sweetistics monorepo defaults

The Sweetistics repo keeps `sweetlink.json` checked in with our internal hosts (`sweetistics.com`, OAuth origins, etc.). Treat it as a working example—clone `sweetlink.example.json` when you stand up SweetLink elsewhere, and replace the Sweetistics domains with your own before committing. Downstream apps that previously imported from the `@sweetistics/sweetlink-*` packages should switch to the new `@sweetlink/*` scope; the exports and runtime semantics remain the same.

### Migrating from the `@sweetistics/*` scope

- Replace package imports (`@sweetistics/sweetlink`, `@sweetistics/sweetlink-daemon`, `@sweetistics/sweetlink-shared`) with the new names (`@sweetlink/cli`, `@sweetlink/daemon`, `@sweetlink/shared`) across your app, tests, and build tooling.
- Update any `pnpm --filter` commands, tmux helpers, or scripts that referenced the old scope (for example `pnpm --filter @sweetlink/cli run build`).
- Prefer the new environment variables for admin keys: `SWEETLINK_LOCAL_ADMIN_API_KEY` (dev shells) and `SWEETLINK_ADMIN_API_KEY` (prod shells). Legacy `SWEETISTICS_*` vars continue to work, but plan to remove them once every integration is updated.
- Copy the neutral `sweetlink.example.json` from the repo root when onboarding SweetLink into another project so you start from generic hostnames/domains instead of the Sweetistics defaults.

### Config keys at a glance

- `appLabel` – Friendly display name used in CLI help, prompts, and error messages. Set it via config, `--app-label`, or the `SWEETLINK_APP_LABEL` env; defaults to “your application”.
- `appUrl` – Default URL SweetLink opens in dev mode. Pair it with `port` when your local server is not on 3000. CLI flags (`--url`, `--app-url`) or `SWEETLINK_APP_URL` override it.
- `prodUrl` – Base URL for `--env prod` runs (smoke tests, screenshots). Falls back to the same origin as `appUrl` when omitted or when `SWEETLINK_PROD_URL` is unset.
- `daemonUrl` – Location of the SweetLink daemon. Defaults to `https://localhost:4455`; override when you run the daemon remotely.
- `adminKey` – Admin API key used when the CLI requests short-lived session tokens. Provide it via config/`--admin-key`, `SWEETLINK_LOCAL_ADMIN_API_KEY` (preferred for dev), `SWEETLINK_ADMIN_API_KEY` (prod), or the legacy `SWEETISTICS_*` variables for backwards compatibility.
- `port` – Injected into `appUrl` when no explicit host is provided. Handy for per-service configs (`4100`, `5173`, etc.).
- `healthChecks.paths` – Additional paths the CLI and watchdog probe before assuming the app is healthy. Include JSON APIs or custom `/healthz` endpoints to catch silent failures.
- `cookieMappings` – List of `{ hosts, origins }` entries that teach SweetLink which Chrome profiles to harvest cookies from. Map every hostname your app serves (including wildcards) to the origins you need (auth providers, REST APIs, CDNs). SweetLink combines these with the primary origin for the target URL; no extra domains are assumed automatically.
- `smokeRoutes.defaults` – Ordered array of routes visited by `pnpm sweetlink smoke`. Include additional views or dashboards specific to your app.
- `smokeRoutes.presets` – Named presets (`{ "admin": ["admin/users", "admin/settings"] }`) that become `pnpm sweetlink smoke --routes admin`.
- `servers` – Optional list of commands that start/check your local server per environment. Useful when you want SweetLink to boot your app automatically before running automation.
- `oauthScript` – Absolute or relative path to an OAuth automation script (ESM module). When set, SweetLink loads the module at runtime and calls its `authorize(context)` export to approve third-party consent dialogs.

SweetLink reads the config once at start-up. When you edit `sweetlink.json` rerun the CLI command to pick up the new defaults. Multiple projects on the same machine can keep their own config files; SweetLink stops at the first file it finds while walking up the directory tree, so place project-specific configs as close to the repo root as possible.
See `apps/sweetlink/docs/config.md` for a full configuration reference (including environment overrides).

### OAuth automation scripts

Out of the box SweetLink no longer ships opinionated OAuth heuristics. Instead you can point `oauthScript` at a small ESM module that exports an `authorize(context)` function. The helper receives a `SweetLinkOauthAuthorizeContext` with DevTools and Puppeteer helpers, so you can fully control how SweetLink approves third-party consent prompts. A ready-to-use implementation for Twitter/X lives at `apps/sweetlink/examples/oauth/twitter-oauth-automation.ts`; copy it into your project (or tweak it) and set `oauthScript` to that path to re-enable the previous behaviour. If the script is omitted, SweetLink will log that auto-authorization is disabled and leave the prompt untouched.

You can also specify the script through runtime inputs:

- CLI flag: `pnpm sweetlink open --controlled --oauth-script ./path/to/oauth-handler.ts`
- Environment variable: `SWEETLINK_OAUTH_SCRIPT=./path/to/oauth-handler.ts pnpm sweetlink open --controlled …`

SweetLink resolves paths relative to the current working directory (or uses absolute paths unchanged). Configuration order still applies: CLI flag → config file `oauthScript` → `SWEETLINK_OAUTH_SCRIPT` env → disabled.

Each automation module must export a single async function:

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

See the Twitter example for a complete script that works with X’s current consent UI (stacked DOM selectors, login fallback detection, Puppeteer retries).

## Example App

Looking for a minimal integration? Launch the demo web app under `apps/sweetlink/examples/basic-web`:

```bash
pnpm --filter @sweetlink/example-basic-web dev
```

The Vite dev server auto-reloads whenever you tweak the example UI. The site exposes a single page with an “Enable SweetLink” button. Clicking it calls the included `/api/sweetlink/handshake` route, registers with your locally running daemon, and keeps the socket alive so you can attach via `pnpm sweetlink console demo`. The example bundles a small browser client that handles the `register`, `heartbeat`, and `runScript` command flow so you can verify end-to-end behaviour without touching your production app.

Once attached, experiment with commands such as:

- `pnpm sweetlink run-js demo --code "demo.updateKpi(87)"` – change the KPI badge value.
- `pnpm sweetlink run-js demo --code "demo.toggleBadge()"` – flip the feature badge between `beta` and `stable`.
- `pnpm sweetlink screenshot demo --selector "#screenshot-card"` – capture the pre-styled analytics card.

The demo exposes a handful of helpers on `window.demo` so you can script UI tweaks before grabbing screenshots.

## Local Checks

```bash
pnpm --filter @sweetlink/cli run lint
pnpm --filter @sweetlink/cli run test
```

Standalone repo:

```bash
pnpm lint
pnpm test
```

## License

The CLI inherits this monorepo’s license; consult `LICENSE` at the repo root before redistribution.
