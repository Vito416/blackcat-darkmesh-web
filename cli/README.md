# CLI bridge (darkmesh web)

Purpose
- Provide a single entrypoint (`blackcat` wrapper) within the admin console for ops tasks (verify, config, deploy) without installing separate PHP CLIs.
- Discover commands via manifests (future) and proxy to local scripts/services.
- Replace standalone `blackcat-cli` for the darkmesh stack; lives inside the web app.

Initial scope
- Wrapper scripts to invoke gateway/write/AO/worker helpers (lint, smoke tests, export bundle).
- Provide `telemetry:pull` and `templates:sync` commands hooked into web modules.
- No direct Arweave writes; deploy/publish still happens via gateway.

Future (manifest-based)
- Load `blackcat-cli.json` manifests from workspace to expose component-specific commands.
- Generate help from manifests; keep logic in modules, not in the CLI.

Constraints
- Read-only for most commands; mutation limited to local files or gateway APIs the admin already controls.
- Keep dependencies minimal (Node/TS preferred alongside web stack).
