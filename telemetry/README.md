# Telemetry (darkmesh web module)

Purpose
- In-web viewer for anonymized aggregates (usage, cache hit/miss, webhook retries, PSP breaker) sourced from gateway/worker/write/AO exports.
- Pulls read-only stats from Arweave (on-chain snapshots) or AO public state; no PII, no write access.
- Replaces separate analytics/feedback/insights/metrics/monitoring/usage repos for the darkmesh stack.

Near-term (in-web)
- Implement fetcher for Arweave/AO export of aggregates (NDJSON/JSON) and render dashboards in admin UI.
- Local alerts thresholds (cache hit ratio, retry backlog, ingest lag); no external Prom required.
- Support offline mode: last downloaded snapshot stored locally.

On-chain snapshot plan (low priority)
- Define snapshot format (e.g., NDJSON) with hashes; publish to Arweave periodically.
- Keep only aggregate counters (no PII, no raw events).
- Gateway remains the Arweave client; web just reads via gateway endpoint.

Constraints
- No PII or secrets stored or transmitted.
- No mutation APIs; strictly read-only stats.
- If Arweave unavailable, fall back to cached snapshot.

Open TODOs
- Add schema for aggregate snapshot (usage/cache/psp/webhook).
- Add UI wiring in `src/` to display charts/tables.
- Provide stub data for dev mode.
