---
summary: Notes for keeping the standalone Sweetlink repo in sync with the Sweetistics monorepo.
---

## Monorepo Sync Ritual

- Run `rsync -av --delete --exclude '.git/' --exclude 'node_modules/' --exclude 'dist/' --exclude 'coverage/' --exclude 'tmp/' /Users/steipete/Projects/sweetistics/apps/sweetlink/ /Users/steipete/Projects/sweetlink/` from the Sweetistics root whenever we need to refresh this repo.
- Because this lives outside the monorepo, skip `./runner` and call git/pnpm directly in `~/Projects/sweetlink`.
- Recreate standalone-only files after the sync. Today that means restoring `.gitignore` (node_modules, tmp, coverage artifacts) so local cruft stays out of commits.
- Install deps (`pnpm install`) because rsync excludes `node_modules/`, then run `pnpm test` and `pnpm run build` to make sure Vitest/unit coverage and the publish build are still healthy. Note: as of 2025-11-08 `pnpm test` fails early because `tsconfig.json` extends `../../tsconfig.base.json`; either copy that file in or point the config at a local base before shipping.
- Once checks are green (or you’ve documented the failure reason), commit with `chore: sync sweetlink from sweetistics` (or a scoped variant) and push to `origin/main`.
