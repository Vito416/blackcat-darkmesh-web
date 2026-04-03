# Builder Entitlements Review (Electron)

Current `electron-builder.yml` highlights:

- macOS: `hardenedRuntime: true`, entitlements files: `build/entitlements.mac.plist`; notarization disabled (`notarize: false`).
- Windows: update code-signature verification disabled (`verifyUpdateCodeSignature: false`); NSIS one-click installer.
- Linux: AppImage and deb; no extra capabilities requested.

Recommendations when updating:
- Keep entitlements plist minimal (no microphone/camera unless justified).
- Ensure `sandbox` remains enabled in renderer (mirrors `webPreferences` guard in code/tests).
- If notarization is enabled later, keep hardened runtime and review Apple entitlements on each change.
- Avoid adding auto-launch or background-task entitlements without product sign-off.
