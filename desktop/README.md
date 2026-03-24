# Blackcat Desktop (skeleton)

Cross‑platform desktop shell for blackcat write:

- **Electron + Vite + React + TypeScript**
- **SQLite (better-sqlite3) + Y.js** (planned) for offline state
- **@permaweb/aoconnect** for AO deploy (to be wired)

## Commands (after `npm install`)

```bash
npm run dev      # start Vite (renderer) + Electron (main) with live reload
npm run build    # production build (renderer bundle + copy main/preload)
npm run lint     # eslint (placeholder)
```

### PIP worker env (renderer + main)

Set these in your shell or `.env` to let the desktop hit your worker:

- `WORKER_PIP_BASE` / `WORKER_BASE_URL` – base URL of the worker (e.g. `https://worker.example.com`)
- `WORKER_PIP_TOKEN` – bearer token if required
- `WORKER_PIP_LATEST_PATH` – override latest endpoint (defaults to `/pip/latest`)
- Optional renderer-time aliases (`VITE_PIP_*`) match the same keys for live reload.

## TODO
- Wire Y.js/Automerge for offline collaboration.
- Add SQLite layer (better-sqlite3 or sql.js depending on sandbox needs).
- Implement AO deploy workflow via @permaweb/aoconnect, bundling module from `dist/ao-write.js`.
- Hook key storage into OS keychain (Keytar / platform secrets).
- Add IPC channels for:
  - page CRUD / previews
  - local bundle export/import
  - AO spawn + status

## Structure
```
desktop/
  package.json        # scripts + deps
  tsconfig.json
  vite.config.ts      # renderer (React)
  src/
    main.ts           # Electron main process
    preload.ts        # safe IPC bridge placeholder
    renderer/
      index.html
      main.tsx
      App.tsx
```

This is intentionally minimal so it can be filled with shared UI blocks from blackcat-darkmesh-web.
