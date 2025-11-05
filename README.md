# SweetLink CLI

SweetLink is a command-line companion for the Sweetistics platform. It drives a real browser session through the SweetLink daemon so you can authenticate, capture screenshots, run smoke tests, and gather DevTools telemetry without wiring up a headless automation stack.

## Features

- **Session management** – list active sessions, inspect console/network buffers, and reconnect after hot reloads.
- **Controlled Chrome launch** – spin up a DevTools-enabled browser, sync cookies from your main profile, and auto-approve the Twitter OAuth consent flow.
- **Smoke tests** – navigate the major Sweetistics routes (`timeline/home`, `insights`, `search`, `pulse`, and settings) and flag authentication or runtime errors.
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
pnpm --filter @sweetistics/sweetlink run build
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

- `pnpm sweetlink open --controlled --path timeline/home` – launch/reuse the controlled Chrome window.
- `pnpm sweetlink sessions` – view active sessions (codename, heartbeat, socket state, buffered console errors).
- `pnpm sweetlink smoke --routes main` – sweep timeline, insights, search, pulse, and settings routes.
- `pnpm sweetlink devtools authorize` – force-click the OAuth consent button when Twitter prompts.

When a session fails to register, the CLI now emits a DevTools snapshot and Puppeteer scrape (overlay/body text) so build/runtime errors surface immediately.

## Example App

Looking for a minimal integration? Launch the demo web app under `apps/sweetlink/examples/basic-web`:

```bash
pnpm --filter @sweetistics/sweetlink-example-basic-web dev
```

The Vite dev server auto-reloads whenever you tweak the example UI. The site exposes a single page with an “Enable SweetLink” button. Clicking it calls the included `/api/sweetlink/handshake` route, registers with your locally running daemon, and keeps the socket alive so you can attach via `pnpm sweetlink console demo`. The example bundles a small browser client that handles the `register`, `heartbeat`, and `runScript` command flow so you can verify end-to-end behaviour outside the main Sweetistics app.

Once attached, experiment with commands such as:

- `pnpm sweetlink run-js demo --code "demo.updateKpi(87)"` – change the KPI badge value.
- `pnpm sweetlink run-js demo --code "demo.toggleBadge()"` – flip the feature badge between `beta` and `stable`.
- `pnpm sweetlink screenshot demo --selector "#screenshot-card"` – capture the pre-styled analytics card.

The demo exposes a handful of helpers on `window.demo` so you can script UI tweaks before grabbing screenshots.

## Local Checks

```bash
pnpm --filter @sweetistics/sweetlink run lint
pnpm --filter @sweetistics/sweetlink run test
```

Standalone repo:

```bash
pnpm lint
pnpm test
```

## Syncing With Standalone Repo

All active development happens under `apps/sweetlink/**`. To mirror changes into the public repo (`~/Projects/sweetlink`):

1. Run the local checks above.
2. Copy the sources:
   ```bash
   rsync -a apps/sweetlink/src/ ~/Projects/sweetlink/src/
   rsync -a apps/sweetlink/shared/ ~/Projects/sweetlink/shared/
   rsync -a apps/sweetlink/tests/ ~/Projects/sweetlink/tests/
   cp apps/sweetlink/vitest.config.ts ~/Projects/sweetlink/vitest.config.ts
   ```
3. Inside `~/Projects/sweetlink`, run `pnpm install`, `pnpm test`, and `pnpm lint`.
4. Commit/publish from the standalone repo as needed.

## License

The CLI inherits the Sweetistics repo license; consult `LICENSE` at the repo root before redistribution.
