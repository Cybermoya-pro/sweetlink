# SweetLink Sync Notes

This standalone repository mirrors `apps/sweetlink` from the Sweetistics monorepo. When you update the monorepo, sync changes here with:

```bash
rsync -a --delete /Users/steipete/Projects/sweetistics/apps/sweetlink/ ~/Projects/sweetlink/
```

Because `--delete` removes the `.git` directory, immediately restore it:

```bash
git clone https://github.com/steipete/sweetlink.git ~/Projects/sweetlink-temp
mv ~/Projects/sweetlink-temp/.git ~/Projects/sweetlink/
rm -rf ~/Projects/sweetlink-temp
```

After syncing, review the diff, add back any standalone-only files (like this guide), then commit/push using plain git commands.
