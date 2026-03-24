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
