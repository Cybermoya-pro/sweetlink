# SweetLink Sync Notes

These steps keep the standalone repository aligned with the Sweetistics monorepo.

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
4. Commit from `~/Projects/sweetlink` and push to `https://github.com/steipete/sweetlink.git`.

Keep these notes out of the published README so end users only see product documentation.
