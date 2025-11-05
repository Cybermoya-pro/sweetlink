# SweetLink Release Checklist

This repository publishes three npm packages under the `@sweetlink` scope:

- `@sweetlink/shared` – shared helpers and types
- `@sweetlink/daemon` – controlled Chrome daemon
- `@sweetlink/cli` – SweetLink command-line interface

Follow the steps below for every release. Tasks marked **(manual)** require human intervention (e.g., npm 2FA prompts).

## 1. Prep Workspace

1. Ensure your working tree is clean and synced with `main`.
2. Confirm npm access to the `@sweetlink` scope (`npm whoami`, `npm access ls-collaborators @sweetlink/cli`).
3. Install dependencies and verify toolchain:
   ```bash
   pnpm install
   pnpm --version
   node --version   # must be >= 22.x
   ```

## 2. Readiness Checks

1. Build and test every package:
   ```bash
   pnpm --filter @sweetlink/shared run build
   pnpm --filter @sweetlink/daemon run build
   pnpm --filter @sweetlink/cli run lint
   pnpm --filter @sweetlink/cli run test
   pnpm --filter @sweetlink/cli run build
   pnpm --filter @sweetlink/daemon run test
   pnpm --filter @sweetlink/cli pack --pack-destination ../../tmp/release
   ```
2. Inspect the generated tarballs under `tmp/release/` to ensure they contain `dist`, `LICENSE`, and `README` assets.
3. Update `CHANGELOG.md` (move “Unreleased” entries into a new version section) and refresh docs if the CLI surface changed.

## 3. Version Bumps

1. Choose the new semver (e.g., `0.1.1`).
2. Update `version` in:
   - `package.json`
   - `shared/package.json`
   - `daemon/package.json`
3. Run `pnpm install` to refresh the lockfile if necessary.
4. Commit the version bump and changelog update (e.g., `chore: release v0.1.1`).

## 4. Publish Order

Publish from the repo root so workspace dependencies resolve correctly. Each publish prompts for OTP if 2FA is enabled.

1. **Shared**
   ```bash
   pnpm publish --filter @sweetlink/shared --access public
   ```
2. **Daemon**
   ```bash
   pnpm publish --filter @sweetlink/daemon --access public
   ```
3. **CLI**
   ```bash
   pnpm publish --filter @sweetlink/cli --access public
   ```

Verify npm outputs the new version and package URL after each publish.

## 5. Post-Publish

1. Tag the release:
   ```bash
   git tag -a sweetlink-v0.1.1 -m "SweetLink v0.1.1"
   git push origin sweetlink-v0.1.1
   ```
2. Create a GitHub release referencing the tag and changelog notes.
3. Update internal docs or announcements as needed.

## 6. Troubleshooting

- **Missing files in tarball**: confirm the `files` array in each package includes required assets, then rerun `pnpm pack`.
- **Type resolution errors**: run `pnpm clean`, rebuild, and verify `tsconfig` path mappings.
- **Publish 403**: ensure your npm token has publish rights and re-authenticate via `npm login`.
- **Out-of-date dist**: make sure `prepublishOnly` scripts finish successfully before publishing.

Keep this document up to date as the release workflow evolves.
