# Network Allowlist & HTTPS Guard (Desktop)

The desktop renderer wraps `fetch`/axios so requests are only allowed to:

- `https://` hosts explicitly allowlisted
- Local development hosts (`localhost`, `127.0.0.1`, `[::1]`)
- Default endpoints: `arweave.net`, `push.forward.computer`, `push-1.forward.computer`, `schedule.forward.computer`, `api.pwnedpasswords.com`

## How hosts are discovered

1. Static defaults (above)
2. Environment or settings keys (first non-empty wins):
   - `GATEWAY_URL`
   - `WORKER_PIP_BASE`, `WORKER_API_BASE`, `WORKER_BASE_URL`
   - `AO_URL`
   - `SCHEDULER_URL`, `AO_SCHEDULER_URL`, `AO_SCHEDULER`

The host portion of each URL is added (lowercased). Invalid URLs are ignored and blocked at runtime.

## Runtime behavior

- Non-HTTPS remote URLs are blocked with an error.
- `data:` fetches are blocked.
- Requests to non-allowlisted hosts throw `ERR_URL_BLOCKED` (axios) or a fetch error with the reason.

## Updating the allowlist

- Prefer configuring via environment/`.env` or saved settings (UI stores to localStorage and is read by `resolveEnvWithSettings`).
- For hard additions, edit `STATIC_ALLOWLIST` in `desktop/src/renderer/services/networkGuard.ts` and keep defaults minimal.

## CI guard

- `npm run ci:guard` (root) enforces axios pinning against supply-chain incidents. It does **not** manage the allowlist; review changes to `networkGuard.ts` and this document in PRs.
