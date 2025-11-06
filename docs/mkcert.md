---
summary: 'How SweetLink relies on mkcert for local TLS and how to trust the daemon certificate.'
read_when:
  - setting up SweetLink on a new machine
  - seeing TLS warnings when enabling SweetLink
---

# mkcert & SweetLink TLS

SweetLink uses the [mkcert](https://github.com/FiloSottile/mkcert) tool to mint a development certificate for the daemon at `https://localhost:4455`. This keeps the daemon on HTTPS (matching production) while still working offline.

## Where everything lives

| Purpose | Path |
| --- | --- |
| Certificate authority (CA) that mkcert installs | macOS: `~/Library/Application Support/mkcert` (platform-specific elsewhere) |
| Daemon certificate | `~/.sweetlink/certs/localhost-cert.pem` |
| Daemon private key | `~/.sweetlink/certs/localhost-key.pem` |
| SweetLink signing secret (session tokens) | `~/.sweetlink/secret.key` |

Every project reuses those files. Deleting them forces SweetLink to regenerate a new certificate/key pair the next time the daemon starts.

## One-time setup

1. Install mkcert + nss (if you haven’t already):
   ```bash
   brew install mkcert nss
   ```
2. Run the SweetLink helper:
   ```bash
   pnpm sweetlink trust-ca
   ```
   That executes `mkcert -install` so the OS trust stores know about the local CA.
3. In **each browser profile you care about**, visit:
   ```
   https://localhost:4455
   ```
   Click through the warning once. Chrome/Firefox remember the decision per profile, so the warning never reappears for that profile—and automation driven via that profile will succeed.

## Why a browser prompt still appears

- The daemon certificate is shared globally, but browsers isolate trust settings by profile.
- Remote-debugging or incognito sessions behave like fresh profiles, so they need the once-per-profile acknowledgement.
- After you accept the prompt, the SweetLink example page will show “TLS trusted” and the CLI’s WebSocket handshake succeeds.

## Demo TLS banner

The example app (`pnpm --filter @sweetlink/example-basic-web dev`) calls `/api/sweetlink/status` before enabling SweetLink. The banner exposes:

- **Open Daemon Certificate** – launches `https://localhost:4455` in a new tab so you can accept the warning.
- **Retry Check** – re-runs the TLS probe after you accept the prompt.

## Sharing across projects

Because the cert/key live in `~/.sweetlink`, there’s nothing extra to configure when you clone the standalone SweetLink repo or another project that embeds the daemon. All of them read the same files. If you intentionally want a different certificate (for example, you rotate environments), set:

```bash
export SWEETLINK_SECRET_PATH=/path/to/secret.key
export SWEETLINK_CA_PATH=/path/to/localhost-cert.pem
export SWEETLINK_CAROOT=/path/to/certs
```

…and restart the daemon/CLI.

## Troubleshooting

- **Still seeing warnings after trusting**: make sure you trusted the CA in the same profile the automation uses (e.g., the remote-debugging profile). Some automation contexts spawn a fresh profile each time—consider launching a dedicated Chrome via `pnpm sweetlink open --controlled` so the CLI manages the profile.
- **mkcert not found**: install it first (`brew install mkcert nss`). The daemon stops with an error otherwise.
- **Need to reset**: delete `~/.sweetlink/certs/*` and re-run `pnpm sweetlink trust-ca`.

Once the CA is trusted and the daemon certificate exists, every project (and the example app) can attach via HTTPS without manual certificate juggling.
