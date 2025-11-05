# SweetLink Daemon

The SweetLink daemon keeps a DevTools-enabled Chrome session available for the SweetLink CLI. It exposes a secure WebSocket endpoint, forwards console and network telemetry, and automates reconnect/reuse of controlled browser windows.

## Installation

```bash
pnpm add @sweetlink/daemon
```

## Usage

```bash
pnpm sweetlink-daemon
```

By default the daemon listens on `https://localhost:4455` and launches Chromium with remote debugging enabled. Configure origins, TLS certificates, and admin keys through the shared SweetLink config helpers.

## License

MIT © Peter Steinberger
