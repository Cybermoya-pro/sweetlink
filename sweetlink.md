---
summary: Notes for keeping the standalone SweetLink repo in sync with the Sweetistics monorepo.
---

## Sync Ritual

1. From the Sweetistics root run the mirrored rsync, now excluding standalone-only files so CI artifacts stick around:
   ```sh
   rsync -av --delete \
     --exclude '.git/' \
     --exclude 'node_modules/' \
     --exclude 'dist/' \
     --exclude 'coverage/' \
     --exclude 'tmp/' \
     --exclude '.github/' \
     --exclude '.gitignore' \
     --exclude 'pnpm-lock.yaml' \
     --exclude 'sweetlink.md' \
     --exclude 'tsconfig.base.json' \
     /Users/steipete/Projects/sweetistics/apps/sweetlink/ /Users/steipete/Projects/sweetlink/
   ```
2. In `~/Projects/sweetlink` run `pnpm run standalone:post-sync`. The script copies `../sweetistics/tsconfig.base.json` (override with `SWEETLINK_UPSTREAM_TSCONFIG` when the path differs) and patches `tsconfig.json` so `tsc` continues to resolve `@sweetlink/*` imports inside this repo.
3. Reinstall deps (`pnpm install`) to refresh the local lockfile and run `pnpm test && pnpm run build` before committing/pushing.

If the upstream repo moves or you need to compare a fresh `tsconfig`, point `SWEETLINK_UPSTREAM_TSCONFIG` at the correct file and rerun the post-sync script.

## Continuous Integration

- `.github/workflows/ci.yml` runs on every push/PR to `main` using Node 22 with cached pnpm modules.
- Steps: `pnpm install --frozen-lockfile`, `pnpm run lint`, and `pnpm test`. Add more jobs (build, publish dry-run, etc.) as the standalone repo grows.
- Because rsync excludes `.github/` now, future syncs keep the workflow intact and CI stays green after each mirror.

## Checklist Before Push

- `pnpm run standalone:post-sync`
- `pnpm install`
- `pnpm test`
- `pnpm run build`
- `git status` should show only the expected upstream deltas + lockfile bump.
