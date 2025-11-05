# SweetLink Shared

This package exposes the platform-independent building blocks that power the SweetLink CLI and daemon. It includes shared types, configuration helpers, and environment utilities so downstream tooling can keep behaviour aligned with the canonical implementation.

## Installation

```bash
pnpm add @sweetlink/shared
```

## Contents

- `@sweetlink/shared` – core helpers and type definitions
- `@sweetlink/shared/env` – environment variable parsing helpers
- `@sweetlink/shared/node` – Node-specific utilities (filesystem, logging, etc.)

## License

MIT © Peter Steinberger
