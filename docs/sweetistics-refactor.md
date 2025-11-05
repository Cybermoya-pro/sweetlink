---
summary: 'Checklist for removing Sweetistics-specific assumptions from SweetLink.'
---

# SweetLink De-Sweetistics Checklist

The current SweetLink CLI inherits a lot of Sweetistics branding and defaults. This document tracks everything that still references Sweetistics and outlines the changes required to make the package fully brand-agnostic.

## 1. CLI Messages

- [x] `src/index.ts`
  - [x] Command description for `open`: "Open Sweetistics in Chrome..." Should be parameterised via a `displayName` config/flag.
  - [x] Error message in `logOpenCommandReachabilityErrors`: mentions "Start the web app with \"pnpm dev\" from the Sweetistics repository". Needs a generic instruction or configurable message.
- [x] `src/token.ts`
  - [x] Warning text says "Sweetistics dev server". Replace with a neutral phrase.

## 2. Prompt Copy / AI Integration

- [x] `src/codex.ts`
  - [x] Console-analysis prompt describes the app as "Sweetistics analytics website".
- [x] `src/runtime/screenshot.ts`
  - [x] Screenshot and console prompts reference "Sweetistics" explicitly.

**Status:** `appLabel` configuration now feeds prompts with a "your application" fallback when unspecified.

## 3. Default URLs & Domain Heuristics

- [x] `shared/src/env.ts` & `src/env.ts`
  - [x] Default `prodAppUrl` is `https://sweetistics.com`. Shift to config-driven defaults (`localhost` in dev, no prod fallback).
- [x] `src/runtime/cookies.ts`
  - [x] Drop `isSweetisticsDomain` regex in favour of explicit `cookieMappings`.
- [x] `sweetlink.json`
  - [x] Keep Sweetistics mapping as an example, but ship a neutral `sweetlink.example.json` (and reference it in docs).

## 4. Documentation / Examples

- [x] `README.md`
  - [x] Split "Sweetistics defaults" vs "generic usage" sections.
  - [x] Swap example config domains for neutral values (e.g., `https://app.example.dev`).
  - [x] Update Vite example copy that references "main Sweetistics app".
- [x] `docs/config.md`
  - [x] Replace Sweetistics URLs with neutral placeholders or clearly mark them as defaults.

## 5. Tests

- [x] Replace Sweetistics domain assertions with neutral fixtures (`example.dev`, `analytics.dev`, etc.) while preserving behavioural intent.
  - [x] `tests/url-runtime.test.ts`
  - [x] `tests/runtime/chrome/launch.test.ts`
  - [x] `tests/runtime/chrome/focus.test.ts`
  - [x] `tests/token-cache.test.ts`
  - [x] `tests/session-id-resolution.test.ts`

## 6. Miscellaneous

- [x] Audit `apps/sweetlink/examples/**` (package names, READMEs, comments) for Sweetistics branding.
- [x] Ensure CLI help (`pnpm sweetlink --help`) and flag descriptions pull from `AppBrandConfig` rather than hard-coded copy.

## 7. Package Naming & Module Scope

- [x] Decide on the published package scope. If SweetLink should be consumable outside the Sweetistics org, rename:
  - [x] `apps/sweetlink/package.json` (`name`, `repository`, `bugs` URLs).
  - [x] `apps/sweetlink/shared/package.json` and `apps/sweetlink/daemon/package.json`.
  - [x] Workspaces/TS path aliases pointing at `@sweetlink/*` (see `apps/sweetlink/tsconfig.json`, `apps/sweetlink/daemon/tsconfig.json`).
- [x] Document migration guidance for downstream apps relying on the `@sweetistics/*` scope.

## 8. Build & Release Tooling

- [x] Update `pnpm` scripts and CI jobs to use the new package names (or accept a configurable scope).
- [x] Confirm `pnpm changeset` / release automation produces generic changelog entries (no Sweetistics branding baked into templates).
- [x] Check any GitHub Action workflow messages for Sweetistics-specific copy.

## 9. Communications & Onboarding

- [x] Draft release notes describing the brand-agnostic CLI (link back to this checklist).
- [x] Add a quick-start snippet for non-Sweetistics teams (link to neutral config file, auth prerequisites).
- [x] Update internal onboarding docs (SweetLink section in `docs/cli/overview.md`) once the changes land.

## Suggested Refactor Order

1. Introduce `AppBrandConfig` (label + default host URLs) propagated through CLI/help/prompt copy.
2. Remove hard-coded domain regex, rely solely on `cookieMappings`/config.
3. Rewrite docs/examples/tests to generic domains.
4. Keep a Sweetistics config in the monorepo under `sweetlink.json` but mark it as an example; maybe add a `sweetlink.example.json` for others.

Once these steps are complete, SweetLink should be reusable by any project without Sweetistics-specific strings or behaviour.
