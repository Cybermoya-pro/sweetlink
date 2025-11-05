# SweetLink Sync Notes

These steps keep the standalone repository aligned with the Sweetistics monorepo. Always make code/docs changes in `apps/sweetlink/**` first, then sync them back here so the monorepo remains the source of truth.

1. From `/Users/steipete/Projects/sweetistics`, mirror the package:
   ```bash
   rsync -a --delete apps/sweetlink/ ~/Projects/sweetlink/
   ```
   (Use `--exclude README.md` if you want to preserve the standalone documentation.)
2. Regenerate distributable artifacts if they are stale:
   ```bash
   pnpm --filter @sweetistics/sweetlink run build
   ```
3. Update the standalone `.gitignore` or aux files if new temp directories appear.
4. Keep `sweetlink.json` in sync with the monorepo copy so cookie mappings stay aligned.
5. Commit from `~/Projects/sweetlink` and push to `https://github.com/steipete/sweetlink.git`.

## Rebuilding sqlite3 for SweetLink cookie sync

If `pnpm sweetlink open --controlled …` starts warning `Could not locate the bindings file … sqlite3/node_sqlite3.node`, the bundled prebuild doesn’t match your Node version (Node 25 at the moment). Fix it by rebuilding sqlite3 from source via `node-gyp`:

```bash
cd /Users/steipete/Projects/sweetistics/node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3
npx node-gyp rebuild --verbose
```

That produces `build/Release/node_sqlite3.node`, allowing chrome-cookies-secure to copy cookies again on subsequent runs. Re-run the rebuild whenever you bump Node or reinstall dependencies.

Keep these notes out of the published README so end users only see product documentation.
