# Render & FX Performance Budgets

- **Paint budget**: Keep heavy layers (gradients, shadows, blur) under **10 ms/frame** in Chrome Performance at 60 fps. Use `contain: paint`/`will-change` only on elements that truly animate; prefer bitmap caching on a single layer.
- **Blur/gradient guardrails**:
  - Limit combined `backdrop-filter`/`filter: blur` overlays to **1 active layer** per viewport region; cache with `transform: translateZ(0)` when static.
  - Avoid animating blur radius; toggle opacity/visibility instead.
  - Prefer linear/solid backgrounds for scrolling containers; push complex gradients to fixed layers.
- **Layout/reflow budget**: Avoid forced reflow in scroll/drag handlers; target **<1 layout pass per interaction**.
- **Memory budget**: Diff/render views should stay **<300 MB JS heap** (perf test enforces). Long lists must be virtualized.
- **Bundle budget**: Viewer entry chunk **≤300 KB gzip**; load feature chunks (diff, AO panels, FX canvases) lazily.
- **Network budget**: Initial diff payloads **<400 KB**; subsequent hunks loaded on demand; cache manifests with ETag+TTL (5 min default).

## How to validate
- `BUNDLE_REPORT=1 npm run build` to inspect chunk weights.
- Profile scroll/interaction in Chrome DevTools Performance: keep paint <10 ms and layers composited.
- `npm run test -- --project=chromium tests/perf-diff.spec.ts` to catch FPS/memory regressions.
