# Changelog

## Unreleased

### Added
- _Nothing yet._

### Changed
- _Nothing yet._

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
