# SweetLink Release Checklist

SweetLink now ships as a single npm package: `sweetlink`. The daemon and shared helpers are bundled inside the CLI tarball, so you only publish once.

## 1. Prep Workspace

1. Ensure your working tree is clean and synced with `main`.
2. Confirm npm access (`npm whoami`).
3. Install deps and verify toolchain:
   ```bash
   pnpm install
   pnpm --version
   node --version   # ≥ 22
   ```

## 2. Readiness Checks

```bash
./runner pnpm --filter sweetlink run lint
./runner pnpm --filter sweetlink run test
./runner pnpm --filter sweetlink run build
./runner pnpm pack --filter sweetlink --pack-destination ../../tmp/release
```

Inspect the tarball in `tmp/release/` (verify `dist/`, `LICENSE`, `README.md`).

## 3. Version Bump

1. Choose the new semver (e.g., `0.1.1`).
2. Update `apps/sweetlink/package.json` and `apps/sweetlink/CHANGELOG.md`.
3. Commit the change: `chore: release v0.1.1`.

## 4. Publish

```bash
./runner pnpm --filter sweetlink publish --access public
```

The command runs `pnpm run build` beforehand and publishes the bundled package.

## 5. Post-Publish

1. Tag the release:
   ```bash
   git tag -a sweetlink-v0.1.1 -m "SweetLink v0.1.1"
   git push origin sweetlink-v0.1.1
   ```
2. Create a GitHub release referencing the tag and changelog notes.
3. Update docs/announcements as needed.

## 6. Troubleshooting

- **Tarball missing files:** ensure `files` in `package.json` includes everything and rerun `pnpm pack`.
- **Type errors at runtime:** rerun `pnpm run build` to ensure `dist/` is fresh.
- **Publish 403/404:** check npm login and scope permissions.

Keep this document updated as the release process evolves.
