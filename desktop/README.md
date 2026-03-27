# Blackcat Desktop (skeleton)

Cross‑platform desktop shell for blackcat write:

- **Electron + Vite + React + TypeScript**
- **SQLite (better-sqlite3) + Y.js** (planned) for offline state
- **@permaweb/aoconnect** for AO deploy (to be wired)
- **Roadmap:** see [../ROADMAP.md](../ROADMAP.md) for phased plans.

## Dev tips
- Bundle report: `npm run build:report` (writes `dist/renderer/bundle-report.html` when `BUNDLE_REPORT=true`).
- Faster Playwright install: export `PLAYWRIGHT_SKIP_DOWNLOAD=1` if Chromium is already available.
- Headless on Linux: `xvfb-run npm run test:smoke -- --project=chromium`.

## Commands (after `npm install`)

```bash
npm run clean         # remove dist/ + release/ artifacts
npm run dev           # start Vite (renderer) + Electron (main) with live reload
npm run build         # production build (renderer bundle + compiled main/preload)
npm run package       # build installer(s) for the current OS into release/ (no publish)
npm run package:mac   # macOS dmg + zip for arm64 + x64 (run on macOS)
npm run package:win   # Windows x64 nsis installer + portable exe (run on Windows)
npm run package:linux # Linux x64 AppImage + deb (run on Linux)
npm run lint          # eslint (placeholder)
```

### Packaging (electron-builder)

- Config lives in `electron-builder.yml`; outputs land in `release/`.
- `npm run build` generates theme CSS from `src/renderer/theme/tokens.json` before bundling.
- Targets: macOS dmg + zip (arm64 + x64, unsigned by default), Windows nsis installer + portable exe (x64), Linux AppImage + deb (x64).
- Artifact names: `blackcat-desktop-${version}-mac-${arch}.{dmg|zip}`, `blackcat-desktop-${version}-win-${arch}-setup.exe`, `blackcat-desktop-${version}-win-${arch}-portable.exe`, `blackcat-desktop-${version}-linux-${arch}.{AppImage|deb}`.
- Builds rely on `dist/desktop/src/main.js` + `dist/renderer` from `npm run build`; the `clean` script wipes both build + release artifacts.
- Run platform-specific scripts on their host OS (electron-builder requires macOS to produce dmg/zip and Windows for signed exe/msi-equivalents).
- Unsigned builds: keep `CSC_IDENTITY_AUTO_DISCOVERY=false` to avoid code-sign prompts. If you do want signing later, export the usual `CSC_LINK` / `CSC_KEY_PASSWORD` (or Apple ID creds for notarization) before rerunning the package command.

### Auto-update + release flow
- Auto-update is wired via `electron-updater` and defaults to channel `latest`. Set `BLACKCAT_UPDATE_URL` or `BLACKCAT_UPDATE_BASE_URL` to override the feed (otherwise the packaged `app-update.yml` is used).
- The packaged update config targets GitHub draft releases under `blackcat-labs/blackcat-mesh-nexus`; adjust `electron-builder.yml` if you publish elsewhere.
- Disable auto-update with `BLACKCAT_DISABLE_AUTO_UPDATE=1`; allow pre-release by setting `BLACKCAT_UPDATE_CHANNEL=beta` (or any channel) and optionally `BLACKCAT_UPDATE_PRERELEASE=1`.
- Manual IPC hooks exposed to the renderer: `window.updates.onStatus`, `window.updates.checkNow()`, and `window.updates.quitAndInstall()`.
- macOS notarization stub runs only when `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` are set; see `scripts/notarize.js` and `build/entitlements.mac.plist`.
- Draft release notes template lives at `templates/RELEASE_NOTES_TEMPLATE.md` — copy/fill for each release before uploading artifacts.

### CI
- `.github/workflows/ci.yml` now uploads platform build artifacts (`release/`) for macOS, Windows, and Linux after Playwright smoke tests. Builds run `npm run package:<platform>` with `--publish=never` so nothing is pushed automatically.

### PIP worker env (renderer + main)

Set these in your shell or `.env` to let the desktop hit your worker:

- `WORKER_PIP_BASE` / `WORKER_BASE_URL` – base URL of the worker (e.g. `https://worker.example.com`)
- `WORKER_PIP_TOKEN` – bearer token if required
- `WORKER_PIP_LATEST_PATH` – override latest endpoint (defaults to `/pip/latest`)
- Optional renderer-time aliases (`VITE_PIP_*`) match the same keys for live reload.

### Gateway env (renderer)

- `GATEWAY_URL` / `VITE_GATEWAY_URL` – base gateway or Arweave mirror for pulling manifests by `manifestTx` (defaults to `https://arweave.net`).

### AO deploy helpers (renderer service)
- `src/renderer/services/aoDeploy.ts` now exposes `deployModule(walletOrPath, moduleSrc, tags?)` and `spawnProcess(scheduler?, manifestTx?)` using `@permaweb/aoconnect`.
- Wallet load is mocked: pass a JWK object or JSON string directly, or set `AO_WALLET_JSON`; `AO_WALLET_PATH` is recorded but must be read via preload/IPC later.
- Module deploy adds AO defaults (Type=Module, Module-Format=javascript, Data-Protocol=ao, Content-Type=application/javascript); spawning reads `AO_MODULE_TX` / `VITE_AO_MODULE_TX` and tags Scheduler/Manifest when provided.
- `serializeManifest(manifest)` returns the same JSON as the Export button; upload that to Arweave and pass the TX as `manifestTx` when spawning.
- TODO: wire real wallet loading in preload, surface deploy/spawn status in UI, and thread manifest export → module deploy → process spawn flow.

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
