#!/usr/bin/env node
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connect, createDataItemSigner } from "../desktop/node_modules/@permaweb/aoconnect/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HB_URL = process.env.HB_URL || "https://push.forward.computer";
const SCHEDULER = process.env.HB_SCHEDULER || "n_XZJhUnmldNFo4dhajoPZWhBXuJk-OcQr5JQ49c4Zo";
const AOS_MODULE = process.env.AOS_MODULE || "ISShJH1ij-hPPt9St5UFFr_8Ys3Kj5cyg7zrMGt7H9s"; // official AOS module
const WALLET_PATH = process.env.WALLET_PATH || path.resolve(__dirname, "../../blackcat-darkmesh-write/wallet.json");
const BUNDLE_PATH = process.env.BUNDLE_PATH || path.resolve(__dirname, "../blackcat-darkmesh-write/dist/write-bundle.lua");

async function loadSigner() {
  const raw = await readFile(WALLET_PATH, "utf8");
  return createDataItemSigner(JSON.parse(raw));
}

async function main() {
  const signer = await loadSigner();

  const ao = connect({
    MODE: "mainnet",
    URL: HB_URL,
    MU_URL: HB_URL,
    CU_URL: HB_URL,
    SCHEDULER,
    signer,
  });

  console.log("Spawning process with official AOS module...");
  const processId = await ao.spawn({
    module: AOS_MODULE,
    tags: [
      { name: "Content-Type", value: "text/lua" },
      { name: "Data-Protocol", value: "ao" },
      { name: "Variant", value: "ao.MN.1" },
    ],
    signer,
  });
  console.log("Spawned PID", processId);

  const bundle = await readFile(BUNDLE_PATH, "utf8");
  const lua = `-- bootstrap write bundle into process state\n${bundle}`;

  console.log("Sending Eval with bundled logic (size", lua.length, "chars)...");
  const evalMsg = await ao.message({
    process: processId,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
    ],
    data: lua,
  });
  console.log("Eval message id", evalMsg);

  console.log("Fetching result...");
  const res = await ao.result({ process: processId, message: evalMsg });
  console.dir(res, { depth: 5 });

  console.log("Now sending Health");
  const healthMsg = await ao.message({
    process: processId,
    signer,
    tags: [
      { name: "Action", value: "Health" },
      { name: "Content-Type", value: "application/json" },
    ],
    data: JSON.stringify({ ping: "write-bundle" }),
  });
  const healthRes = await ao.result({ process: processId, message: healthMsg });
  console.log("Health message", healthMsg);
  console.dir(healthRes, { depth: 5 });

  console.log("All done.");
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
