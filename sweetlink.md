# SweetLink Sync Notes

This standalone repository is mirrored from the Sweetistics monorepo (`/Users/steipete/Projects/sweetistics/apps/sweetlink`). When you make changes in the monorepo and want them here, follow this exact flow so both copies stay aligned.

1. From the monorepo root, run:
   ```bash
   rsync -a --delete apps/sweetlink/ ~/Projects/sweetlink/
   ```
   Only run the command in this direction. The `--delete` flag ensures removed files disappear from the standalone repo too.
2. Recreate the git metadata if `rsync` wiped it:
   ```bash
   git clone https://github.com/steipete/sweetlink.git ~/Projects/sweetlink-temp
   mv ~/Projects/sweetlink-temp/.git ~/Projects/sweetlink/
   rm -rf ~/Projects/sweetlink-temp
   ```
3. Restore standalone-only files (like this guide) as needed, then review the diff before committing.
4. Commit and push **using plain git commands** (e.g. `git commit`, `git push`). The Sweetistics `committer` script is only for the monorepo; external repos must use git directly.

Need to pull changes back into the monorepo? Edit under `apps/sweetlink/**`, test there, then repeat the sync path above.
