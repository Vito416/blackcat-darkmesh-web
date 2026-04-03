# Secret Handling Notes

- No secrets should live in the repo or packaged `app.asar`.
- Desktop stores sensitive material in the Pip vault; runtime logs are redacted via `installRedactedConsole` (main/renderer) to mask obvious secrets (passwords, keys, tokens, long hex/base64, PEM blocks).
- Avoid embedding secrets in env files committed to the repo; prefer OS keychains or runtime injection. Rotate build-time tokens if exposed.
- Keep INFO/WARN logs free of payloads; redaction helps but do not log raw secrets before redaction.
- Telemetry/crash: ensure payloads pass the IPC schemas and redaction utilities before sending.
- CI: `scripts/check-axios.js` guards against known malicious axios versions; extend with additional checks if new third-party services are added.
