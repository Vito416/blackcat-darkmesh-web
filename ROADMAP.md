# Web Console Roadmap (draft)

## Phase 1 – MVP
- Worker inbox sync (pull/delete) + encrypted local DB.
- Template fetch from Arweave; manifest signature verification; preview; deploy to Gateway.
- Key management: generate/publish public key to Arweave; store private key locally.
- Basic monitoring screen pulling gateway metrics JSON/OpenMetrics.
- Telemetry reader (basic): load aggregate snapshot from Arweave/AO via gateway and render table.
- CLI bridge (basic): embed `blackcat` wrapper to call local scripts (telemetry:pull, templates:sync, ingest smoke).
- Template catalog bridge: import catalog JSON (frontend-catalog/external), select template txid/hash, publish config to gateway.

## Phase 2 – Security & Build Integrity
- Reproducible site builds with hash + signed manifest.
- CSP/SRI recommendations auto-generated for templates.
- Template safety scan (dependency SBOM, risky APIs).
- UI warnings for untrusted templates.

## Phase 3 – Offline-first & Ops
- Action queue while offline; sync via Gateway when online.
- Scheduled sync of Worker inbox (cron) with delete-on-download.
- Local backups/export of encrypted DB.

## Phase 4 – PQC readiness
- Hybrid keypairs (Ed25519+Dilithium / X25519+Kyber) when libs stable.
- Manifest v2 support with algo identifiers; dual-publish public keys to Arweave.

## Phase 5 – UX polish & Integrations
- Visual template catalog (trusted manifest) with filters.
- Wizard for PSP setup (collects public info only; secrets stay in Worker).
- Alert thresholds editable from UI; export NDJSON of metrics.

## Next TODO (gateway/worker crypto flow)
- Inbox sync job: pull envelopes from Worker, decrypt locally, delete-on-download; show TTL/queue stats.
- Key management UI: generate/rotate admin keys, publish manifest hash to Arweave, download worker config with pubkey.
- Gateway deploy wizard: select template (txid + manifest), configure cache TTL, point to worker URL + forget token.
- Monitoring pane: display gateway cache hit/miss, webhook retry, write/AO queue sizes; alert thresholds.
- Offline DB backup/export (encrypted) with integrity hash for recovery.

## AI Studio (integrated agent)
- Port agent logic to TS (now in `ai-agent/`): prompts, schema, runner with OpenAI client and stub mode.
- UI wizard (no PII) → call runner → validate JSON → store offline; show “Apply plan” to push gateway/template/manifest settings.
- Tests: mock LLM snapshot + schema validation in CI; optional offline stub path for dev.
- Config: `OPENAI_API_KEY`, `OPENAI_MODEL` env; rate-limit + timeout in runner.

## Telemetry (read-only)
- Fetch aggregate snapshots (usage, cache hit/miss, webhook retry, PSP breaker) from Arweave/AO via gateway endpoint; no PII.
- Define snapshot schema + stub data; render charts/tables in admin UI; offline fallback to last snapshot.
- Optional local alerts (thresholds) without external Prometheus.
- Keep on-chain snapshot publishing low priority; gateway acts as Arweave client, web is reader only.

## CLI bridge
- Add minimal `blackcat` wrapper to call local helpers (ingest_smoke, bundle_export, telemetry:pull, templates:sync).
- Future: load `blackcat-cli.json` manifests from workspace to auto-register module commands.
- Keep dependencies aligned with web stack (Node/TS, Node 18+); no external PHP CLI needed.

## Template catalog bridge
- Define normalized schema for templates (id, name, txid, hash, tags, screenshot_url, version).
- Import pipeline from `blackcat-frontend-catalog` + external feeds; dedupe and tag.
- UI gallery with filters + “publish to gateway” action (stores txid/hash for allowlist).
