# Blackcat Web / Desktop – Immutable assets + manifest plan

Goal: serve unlimited pages without overloading gateway. Gateway hosts only immutable assets (UI libs/themes) plus a small per‑page manifest.

## Core ideas
- Immutable assets on Arweave (component bundles, themes, layouts) → CDN-cacheable.
- Small manifest per page lists exact TXIDs of assets + data.
- Deterministic & versioned: manifest references fixed TXIDs; no implicit “latest”.
- Safety: allowlist of approved assets, manifest signatures, CSP on gateway.
- Fallback: multi-gateway fetch and local pin/cache for immutable assets.

## Manifest sketch
```json
{
  "version": "1",
  "pageId": "site-123/home",
  "layout": { "tx": "tx_layout" },
  "theme": { "tx": "tx_theme" },
  "components": [
    { "id": "hero", "tx": "tx_component_hero" },
    { "id": "grid", "tx": "tx_component_grid" }
  ],
  "data": { "tx": "tx_content_json" },
  "entry": { "tx": "tx_entry_bundle" },
  "checksum": "sha256:...",
  "previous": "tx_prev_manifest",
  "signature": { "algo": "ed25519", "sig": "..." }
}
```

## Editor (web + desktop)
- Browse catalog of approved assets (allowlist TX / curated AO feed).
- Compose page from layout/theme/components; edit content.
- Publish: upload any new assets to Arweave, write manifest with TXIDs, sign, optionally emit AO message with manifest TX + hash.
- Offline: SQLite + CRDT (e.g., Y.js) to cache drafts; sync manifests on reconnect.

## Gateway expectations
- Given manifest TX, fetch manifest then assets (prefer local/pinned; fallback to multiple gateways).
- Serve only immutable assets + manifest; minimal CPU/dynamic work.
- Enforce CSP; optional allowlist of asset TXIDs.

## Next steps (web/desktop backlog)
- Define manifest + allowlist models in code.
- Asset catalog fetcher (GQL query / curated AO index).
- Auto-load latest approved themes/components into the builder.
- Publish pipeline: bundle → Arweave upload → manifest write/sign → AO notify.
- Add rollback pointer in manifest (`previous`) for quick revert.
