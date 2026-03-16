# Template Catalog Bridge

Purpose
- Act as the aggregator of internal/external front-end templates (UI kits, themes, flows) that will be deployed to Arweave for the gateway to serve.
- Reuses metadata from `blackcat-frontend-catalog` (ids, tags, deps, screenshots) and can merge external template feeds.
- Provides a normalized manifest (txid + hash + tags) that the admin UI can browse and publish to gateway.

Workflow
1) Import catalog JSON (from `blackcat-frontend-catalog` or external feed).
2) Admin selects template(s); web records txid/manifest hash for gateway allowlist.
3) Gateway fetches from Arweave (read-only); web only reads metadata and pushes config.

Constraints
- No storage of PII; only template metadata and Arweave txids/hashes.
- Gateway is the Arweave client; web acts as selector/metadata manager.

TODO
- Define normalized manifest schema (id, name, txid, hash, tags, screenshot_url, version).
- Add import script to pull `catalog.json` from blackcat-frontend-catalog and merge external sources.
- UI: template gallery + filters + “publish to gateway” action.
