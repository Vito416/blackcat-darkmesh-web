import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { setTimeout as sleep } from "timers/promises";
import { connect, createDataItemSigner } from "../desktop/node_modules/@permaweb/aoconnect/dist/index.js";
import util from "util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROCESS_ID = "Pbs-5TU6N_39WCIb1w1ejxHu9eg1RsVptOjDeVwQ8Ro";

const started = Date.now();
const log = (...args) => console.log(`[write-test ${((Date.now() - started) / 1000).toFixed(1)}s]`, ...args);
setTimeout(() => {
  log("global timeout hit, exiting");
  process.exit(1);
}, 60000);

const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    sleep(ms).then(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = "TIMEOUT";
      throw err;
    }),
  ]);

// HyperBEAM mainnet (Forward) config provided by request
const HB_URL = process.env.HB_URL || "https://push.forward.computer";
const baseConfig = {
  MODE: "mainnet",
  CU_URL: HB_URL,
  MU_URL: HB_URL,
  URL: HB_URL,
  SCHEDULER: process.env.HB_SCHEDULER || "n_XZJhUnmldNFo4dhajoPZWhBXuJk-OcQr5JQ49c4Zo",
};

async function loadSigner() {
  const walletPath = path.resolve(__dirname, "../../blackcat-darkmesh-write/wallet.json");
  const walletRaw = await readFile(walletPath, "utf8");
  const wallet = JSON.parse(walletRaw);
  return createDataItemSigner(wallet);
}

function buildEnvelope(action, payload = {}) {
  const now = Date.now();
  return {
    Action: action,
    actor: "qa-bot",
    tenant: "mesh-nexus",
    nonce: `nonce-${action}-${now}-${Math.random().toString(16).slice(2, 8)}`,
    ts: now,
    payload,
  };
}

function buildTags(envelope) {
  const tags = [
    { name: "Action", value: envelope.Action },
    { name: "Nonce", value: envelope.nonce },
    { name: "Ts", value: String(envelope.ts) },
    { name: "Actor", value: envelope.actor },
    { name: "Tenant", value: envelope.tenant },
    { name: "Content-Type", value: "application/json" },
  ];

  if (envelope.payload?.pageId) {
    tags.push({ name: "Page-Id", value: String(envelope.payload.pageId) });
  }
  if (envelope.payload?.siteId) {
    tags.push({ name: "Site-Id", value: String(envelope.payload.siteId) });
  }

  return tags;
}

async function waitForResult(messageId, attempts = 15, delayMs = 2500) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await client.result({ process: PROCESS_ID, message: messageId });
    if (last?.Output !== undefined || last?.Error || (last?.Messages?.length ?? 0) > 0) {
      return last;
    }
    await sleep(delayMs);
  }
  return last;
}

async function sendAndAwait(action, payload) {
  const envelope = buildEnvelope(action, payload);
  const tags = buildTags(envelope);
  const data = JSON.stringify(envelope);

  log("sending", action);
  const messageId = await withTimeout(
    client.message({ process: PROCESS_ID, signer, data, tags }),
    Number(process.env.SEND_TIMEOUT_MS || 45000),
    `${action} message`,
  );
  log(action, "message id", messageId);
  const result = await withTimeout(
    waitForResult(
      messageId,
      Number(process.env.RESULT_ATTEMPTS || 25),
      Number(process.env.RESULT_DELAY_MS || 3000),
    ),
    Number(process.env.RESULT_TIMEOUT_MS || 90000),
    `${action} result`,
  );
  log(action, "result received");

  return { envelope, messageId, result };
}

function serializeError(err) {
  if (!err) return null;
  return {
    message: err.message,
    stack: err.stack,
    name: err.name,
    status: err.response?.status || err.status,
    statusText: err.response?.statusText,
    data: err.response?.data,
    body: err.body,
    cause: err.cause ? serializeError(err.cause) : undefined,
    keys: Object.keys(err || {}),
  };
}

let signer;
let client;

async function main() {
  log("loading signer");
  signer = await loadSigner();
  log("connecting client");
  client = connect({ ...baseConfig, signer });

  const outputs = {};

  try {
    outputs.health = await sendAndAwait("Health", { ping: "write-bundle" });
  } catch (err) {
    outputs.health = { envelope: buildEnvelope("Health", { ping: "write-bundle" }), error: serializeError(err) };
  }

  const draftPayload = {
    siteId: "site-qa",
    pageId: "home",
    locale: "en",
    blocks: [
      { type: "text", text: "hello from test script" },
    ],
  };

  try {
    outputs.saveDraft = await sendAndAwait("SaveDraftPage", draftPayload);
  } catch (err) {
    outputs.saveDraft = { envelope: buildEnvelope("SaveDraftPage", draftPayload), error: serializeError(err) };
  }

  console.log(JSON.stringify(outputs, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
