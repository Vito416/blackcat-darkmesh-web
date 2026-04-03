import assert from "node:assert/strict";
import test from "node:test";
import { collectAllowedHosts, explainUrlAllowance, guardFetch } from "../src/renderer/services/networkGuard";
import { redactValue } from "../src/shared/logging";

test("collectAllowedHosts adds env configured hosts", () => {
  process.env.GATEWAY_URL = "https://example.org";
  const hosts = collectAllowedHosts();
  assert.ok(hosts.has("example.org"));
  delete process.env.GATEWAY_URL;
});

test("explainUrlAllowance enforces https and allowlist", () => {
  const allowlist = new Set<string>(["arweave.net"]);

  const allowed = explainUrlAllowance(new URL("https://arweave.net/path"), allowlist);
  assert.equal(allowed.ok, true);

  const blockedHttp = explainUrlAllowance(new URL("http://evil.test"), allowlist);
  assert.equal(blockedHttp.ok, false);
  assert.match((blockedHttp as any).reason, /HTTPS/i);

  const localHttp = explainUrlAllowance(new URL("http://localhost:5174"), allowlist);
  assert.equal(localHttp.ok, true);
});

test("guardFetch blocks disallowed hosts", async () => {
  const allowlist = new Set<string>(["example.com"]);
  const calls: string[] = [];
  const originalFetch = (input: any) => {
    calls.push(typeof input === "string" ? input : String(input));
    return Promise.resolve({ ok: true, status: 200 });
  };

  const guarded = guardFetch(allowlist, originalFetch as any);

  assert.throws(() => guarded("https://not-allowed.test/resource"), /Blocked fetch/);

  await guarded("https://example.com/resource");
  assert.deepEqual(calls, ["https://example.com/resource"]);
});

test("redactValue masks obvious secrets", () => {
  const objectResult = redactValue({ password: "supersecret", note: "ok" }) as Record<string, unknown>;
  assert.equal(objectResult.password, "[redacted]");

  const stringResult = redactValue("-----BEGIN PRIVATE KEY-----XYZ-----END PRIVATE KEY-----") as string;
  assert.ok(!stringResult.includes("PRIVATE KEY-----XYZ"));
});
