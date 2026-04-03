import assert from "node:assert/strict";
import test from "node:test";
import { buildCsp, createSecurityPrefs } from "../src/main/securityConfig";

test("webPreferences enforce isolation and sandboxing", () => {
  const prefs = createSecurityPrefs("/tmp/preload.js");
  assert.equal(prefs.contextIsolation, true);
  assert.equal(prefs.nodeIntegration, false);
  assert.equal(prefs.sandbox, true);
  assert.equal(prefs.webSecurity, true);
  assert.equal(prefs.enableRemoteModule, false);
});

test("CSP contains mandatory directives", () => {
  const csp = buildCsp({
    connectSrc: ["'self'", "https://example.com", "http://localhost:5174"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:"],
  });

  assert.match(csp, /default-src 'self';/);
  assert.match(csp, /object-src 'none';/);
  assert.match(csp, /frame-ancestors 'none';/);
  assert.ok(csp.includes("https://example.com"));
  assert.ok(csp.includes("http://localhost:5174"));
});
