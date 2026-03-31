import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connect, createDataItemSigner } from "../desktop/node_modules/@permaweb/aoconnect/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PID = process.env.PID;
if (!PID) {
  console.error("Set PID env");
  process.exit(1);
}

const BUNDLE_PATH = path.resolve(__dirname, process.env.BUNDLE_PATH || "../blackcat-darkmesh-write/dist/write-bundle.lua");
const WALLET_PATH = path.resolve(__dirname, process.env.WALLET_PATH || "../blackcat-darkmesh-write/wallet.json");
const HB_URL = process.env.HB_URL || "https://push.forward.computer";
const SCHEDULER = process.env.HB_SCHEDULER || "n_XZJhUnmldNFo4dhajoPZWhBXuJk-OcQr5JQ49c4Zo";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 4000);
if (!Number.isFinite(CHUNK_SIZE) || CHUNK_SIZE <= 0) {
  console.error("Invalid CHUNK_SIZE");
  process.exit(1);
}

const bundle = fs.readFileSync(BUNDLE_PATH, "utf8");
const TOTAL_CHUNKS = Math.ceil(bundle.length / CHUNK_SIZE);
const REPAIRS = (process.env.REPAIRS || "6,18,19")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0 && n <= TOTAL_CHUNKS);

const getChunk = (i) => bundle.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE);

const signer = createDataItemSigner(JSON.parse(fs.readFileSync(WALLET_PATH, "utf8")));
const ao = connect({ MODE: "mainnet", URL: HB_URL, SCHEDULER, signer });

async function sendRepair(idx) {
  // bezpečný zápis s Base64 aby nerozbily ']]'
  const b64 = Buffer.from(getChunk(idx) ?? "", "utf8").toString("base64");
  const data = `
    local b64 = [==[${b64}]==]
    buffer = buffer or {}
    local ok, chunk = pcall(function()
      if mime and mime.unb64 then return mime.unb64(b64) end
      if crypto and crypto.unb64 then return crypto.unb64(b64) end
      return nil
    end)
    if not ok or not chunk then error("b64 decode failed") end
    buffer[${idx}] = chunk
  `;
  const msg = await ao.message({
    process: PID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Repair", value: String(idx) },
    ],
    data,
  });
  await ao.result({ process: PID, message: msg });
  console.log(`repaired ${idx}`);
}

async function probe(tag, data) {
  const msg = await ao.message({
    process: PID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Probe", value: tag },
    ],
    data,
  });
  for (const backoff of [0, 5000, 10000]) {
    try {
      const res = await ao.result({ process: PID, message: msg });
      return res?.Output?.data || res?.Output || res;
    } catch (e) {
      if (backoff) await new Promise((r) => setTimeout(r, backoff));
    }
  }
  return "timeout";
}

async function main() {
  const stateBefore = await probe(
    "holes+len",
    `
      local buf = buffer or {}
      local holes, count, maxidx = {}, 0, 0
      for k,v in pairs(buf) do
        if type(k)=='number' then
          count = count + 1
          if k > maxidx then maxidx = k end
        end
      end
      local expected = ${TOTAL_CHUNKS}
      for i=1,expected do
        if buf[i]==nil then holes[#holes+1]=i end
      end
      if #holes > 500 then
        local trimmed = {}
        for i=1,500 do trimmed[i]=holes[i] end
        holes = trimmed
      end
      return string.format("holes=%s;count=%d;max=%d", table.concat(holes,","), count, maxidx)
    `
  );
  console.log("state-before:", stateBefore);

  const parsedHoles = (() => {
    if (typeof stateBefore !== "string") return [];
    const m = stateBefore.match(/holes=([^;]*)/);
    if (!m) return [];
    return m[1] ? m[1].split(",").filter(Boolean).map(Number) : [];
  })();

  const targets = parsedHoles.length ? parsedHoles : REPAIRS;

  for (const idx of targets) {
    if (idx < 1 || idx > TOTAL_CHUNKS) continue;
    try {
      await sendRepair(idx);
    } catch (e) {
      console.error(`repair ${idx} failed`, e?.message || e);
    }
  }

  const stateAfter = await probe(
    "holes+len",
    `
      local buf = buffer or {}
      local holes, count, maxidx = {}, 0, 0
      for k,v in pairs(buf) do
        if type(k)=='number' then
          count = count + 1
          if k > maxidx then maxidx = k end
        end
      end
      local expected = ${TOTAL_CHUNKS}
      for i=1,expected do
        if buf[i]==nil then holes[#holes+1]=i end
      end
      if #holes > 500 then
        local trimmed = {}
        for i=1,500 do trimmed[i]=holes[i] end
        holes = trimmed
      end
      return string.format("holes=%s;count=%d;max=%d", table.concat(holes,","), count, maxidx)
    `
  );
  console.log("state-after:", stateAfter);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
