# SweetLink Shared (Internal)

This workspace contains the shared types and helpers that the CLI and daemon build against. It is bundled into the published `sweetlink` package and is not meant to be consumed directly from npm.

When hacking on SweetLink locally you can import directly from `../shared/src/*`. The build step copies the compiled output to `dist/shared`, and the CLI runtime resolves those relative paths at install time.
