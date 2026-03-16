# AI Studio (integrated agent)

Purpose
- Runs “shopping list” generation (Q&A → JSON) directly inside `blackcat-darkmesh-web` (TS/Node), no external PHP sidecar.
- Reuses prompts/schema from the old `blackcat-agent`, but lives alongside the admin console for easy UX wiring.
- Produces a JSON plan that gateway/write/AO can apply; no PII goes to the model.

How it works (MVP)
1) UI wizard collects answers (no sensitive data).
2) Backend calls `ai-agent/src/runner.ts` → LLM (OpenAI) with fixed prompt + schema.
3) Output is validated against `ai-agent/schema/shopping-list.schema.json`.
4) Plan is stored locally/offline and can be “Applied” to gateway (template txid/manifest hash) and write/AO settings.

Development notes
- Prompt lives in `ai-agent/prompts/shopping-list.md`.
- Schema lives in `ai-agent/schema/shopping-list.schema.json`.
- Runner expects `OPENAI_API_KEY` in the environment. If missing, it returns a stub response for offline dev.
- Keep all inputs anonymized; do not send PII/order data to the model.

Next steps
- Wire UI wizard in `src/` to call the runner (child_process or direct import).
- Add TS validator (ajv/zod) and unit test with a mocked LLM response.
- Provide an “Apply plan” hook to push config to gateway/write/AO.
