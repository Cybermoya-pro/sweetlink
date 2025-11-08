# Changelog

## Unreleased

### Added
- _Nothing yet._

### Changed
- Documented the post-connect quick actions, clipboard feedback, and automation prompt library in the README so the example app mirrors the new workflow.

## 0.2.0 — 2025-11-08

### Added
- Integrated the Next.js DevTools MCP endpoint (`/_next/mcp`) so SweetLink prints the official Next error summary (with source-mapped stack traces) whenever a run fails.
- Added targeted Vitest coverage for the Next DevTools parser, OAuth polling helper, and session handshake loop to keep the CLI behavior under test.

### Changed
- OAuth auto-accept now polls the DevTools tab every few hundred milliseconds until the authorize button renders, then logs the exact page (URL/title/host) when it skips instead of a vague “not-twitter.”
- The session bootstrap wait is now readiness-based: we bail as soon as the page finishes loading (or the user-configured `--timeout` expires) instead of sleeping a fixed amount, and the README documents the new semantics.
- SweetLink now emits the Next.js error summary alongside the existing overlay/Puppeteer diagnostics so failures surface instantly in the CLI output.

## 0.1.0-beta.1 — 2025-11-05

### Added
- SweetLink demo app now shows a live session indicator so you can confirm which CLI codename is linked at a glance.
- Added `sweetlink trust-ca` to install the mkcert certificate authority and streamline local TLS setup.
- The demo app now performs a TLS preflight check with retry/open actions before enabling SweetLink.

### Changed
- Documented the CLI ↔ daemon architecture and updated prerequisites in the README to reflect the Node.js 22+ baseline.
- Switched the CLI, daemon, and shared packages to the MIT License and surfaced the license text in-repo.
- Moved Sweetistics-specific config guidance to `docs/cli/sweetlink.md` to keep the public README brand-agnostic.
- Bundled the daemon and shared helpers inside the `sweetlink` package so the npm release ships as a single artifact.
