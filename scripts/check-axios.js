#!/usr/bin/env node
/**
 * CI guard for axios supply-chain incident (malicious 1.14.1 / 0.30.4) and plain-crypto-js dropper.
 * Fails if any package-lock.json contains disallowed axios versions or plain-crypto-js.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const DISALLOWED_AXIOS = new Set(["1.14.1", "0.30.4"]);
const MAX_SAFE_AXIOS = "1.14.0";

async function* walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // skip node_modules to keep this fast
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

function versionGreater(v, max) {
  const toNum = (s) => s.split(".").map((n) => Number(n));
  const [a1, a2, a3] = toNum(v);
  const [b1, b2, b3] = toNum(max);
  if (a1 !== b1) return a1 > b1;
  if (a2 !== b2) return a2 > b2;
  return a3 > b3;
}

async function checkLock(file) {
  const txt = await fs.readFile(file, "utf8");
  const problems = [];
  if (txt.includes("plain-crypto-js")) {
    problems.push("plain-crypto-js present");
  }
  // naive scan for axios@x.y.z tokens
  const regex = /axios@([0-9]+\\.[0-9]+\\.[0-9]+)/g;
  let m;
  while ((m = regex.exec(txt)) !== null) {
    const ver = m[1];
    if (DISALLOWED_AXIOS.has(ver) || versionGreater(ver, MAX_SAFE_AXIOS)) {
      problems.push(`axios ${ver} in ${file}`);
    }
  }
  return problems;
}

async function main() {
  const lockFiles = [];
  for await (const f of walk(repoRoot)) {
    if (path.basename(f) === "package-lock.json") lockFiles.push(f);
  }
  if (lockFiles.length === 0) {
    console.log("No package-lock.json files found; skipping.");
    return;
  }

  const allProblems = [];
  for (const lock of lockFiles) {
    const issues = await checkLock(lock);
    for (const p of issues) allProblems.push(p);
  }

  if (allProblems.length) {
    console.error("❌ Supply-chain guard failed:");
    for (const p of allProblems) console.error(" -", p);
    process.exit(1);
  } else {
    console.log("✅ Axios/plain-crypto-js guard passed");
  }
}

main().catch((err) => {
  console.error("Guard failed to run:", err);
  process.exit(1);
});
