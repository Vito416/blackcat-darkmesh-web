#!/usr/bin/env node
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { connect, createDataItemSigner } from "../desktop/node_modules/@permaweb/aoconnect/dist/index.js";
import { setTimeout as sleep } from "timers/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HB_URL = process.env.HB_URL || "https://push.forward.computer";
const SCHEDULER = process.env.HB_SCHEDULER || "n_XZJhUnmldNFo4dhajoPZWhBXuJk-OcQr5JQ49c4Zo";
const WALLET_PATH = process.env.WALLET_PATH || path.resolve(__dirname, "../../blackcat-darkmesh-write/wallet.json");
const BUNDLE_PATH = process.env.BUNDLE_PATH || path.resolve(__dirname, "../dist/write-bundle.lua");
const PROCESS_ID = process.env.PID;
const num = (v, def = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};
const CHUNK_SIZE = num(process.env.CHUNK_SIZE, 4000);
const PAUSE_MS = num(process.env.PAUSE_MS, 750); // pause between sends to avoid rate limits
const FINALIZE = process.env.FINALIZE !== "false"; // allow skipping finalize step
let START_INDEX = num(process.env.START_INDEX, 0); // skip first N chunks (0-based)
const MAX_CHUNKS = process.env.MAX_CHUNKS ? num(process.env.MAX_CHUNKS) : null; // send at most N chunks
const BATCH_SIZE = num(process.env.BATCH_SIZE, 10); // how many chunks to send before long sleep
const WINDOW_PAUSE_MS = num(process.env.WINDOW_PAUSE_MS, 300000); // long sleep between batches (default 5min)
const AUTO_RESET = process.env.AUTO_RESET !== "false"; // if true, clear buffer before uploading to avoid duplicates
const FINALIZE_ONLY = process.env.FINALIZE_ONLY === "true"; // if true, skip chunk loop and only finalize
const RESET_ON_ERROR = process.env.RESET_ON_ERROR !== "false"; // reset buffer and exit on send error
const VERIFY_COUNT = process.env.VERIFY_COUNT !== "false"; // verify buffer size matches expected
const AUTO_FINALIZE = process.env.AUTO_FINALIZE !== "false"; // run finalize automatically after successful upload
const TRIM_ON_ERROR = process.env.TRIM_ON_ERROR === "true"; // remove last chunk on send error instead of full reset
const AUTO_RESUME = process.env.AUTO_RESUME === "true"; // probe buffer length and continue after it
const RETRIES = num(process.env.RETRIES, 0); // per-chunk retries
const RETRY_BACKOFF_MS = num(process.env.RETRY_BACKOFF_MS, 2000);
const AUTO_REPAIR = process.env.AUTO_REPAIR !== "false"; // after error: wait window, trim/probe, continue
const BATCH_VERIFY = process.env.BATCH_VERIFY !== "false"; // after each batch, probe buffer and resend missing

function assertPositive(name, value) {
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`Invalid ${name}: ${value}`);
    process.exit(1);
  }
}

assertPositive("CHUNK_SIZE", CHUNK_SIZE);
assertPositive("BATCH_SIZE", BATCH_SIZE);
assertPositive("WINDOW_PAUSE_MS", WINDOW_PAUSE_MS);
if (MAX_CHUNKS !== null) assertPositive("MAX_CHUNKS", MAX_CHUNKS);
assertPositive("RETRY_BACKOFF_MS", RETRY_BACKOFF_MS);
assertPositive("PAUSE_MS", PAUSE_MS >= 0 ? PAUSE_MS : -1);

if (!PROCESS_ID) {
  console.error("Set PID env to target process");
  process.exit(1);
}

async function loadSigner() {
  const raw = await readFile(WALLET_PATH, "utf8");
  return createDataItemSigner(JSON.parse(raw));
}

// wrap chunk safely even if it contains ']]'
function makeEval(code) {
  return `-- chunked loader\nbuffer = buffer or {}\n${code}`;
}

async function probeCount(ao, signer) {
  const msg = await ao.message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Probe", value: "count" },
    ],
    data: "local n=buffer and #buffer or 0; return n",
  });
  const res = await ao.result({ process: PROCESS_ID, message: msg });
  return Number(res?.Output?.data || res?.Output || 0);
}

async function trimLast(ao, signer, count = 1) {
  const msg = await ao.message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Trim", value: String(count) },
    ],
    data: `
      local buf = buffer or {}
      local maxidx = 0
      for k,v in pairs(buf) do if type(k)=='number' and k>maxidx then maxidx=k end end
      for i=1,${count} do if maxidx>0 then buf[maxidx]=nil; maxidx=maxidx-1 end end
      return maxidx
    `,
  });
  await ao.result({ process: PROCESS_ID, message: msg });
}

async function probeHoles(ao, signer, max = 200) {
  const msg = await ao.message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Probe", value: "holes" },
    ],
    data: `local m={} for i=1,${max} do if not (buffer and buffer[i]) then m[#m+1]=i end end return table.concat(m, ",")`,
  });
  const res = await ao.result({ process: PROCESS_ID, message: msg });
  const txt = res?.Output?.data || res?.Output || "";
  if (!txt || txt === "") return [];
  return txt.split(",").map((x) => Number(x)).filter((n) => Number.isFinite(n));
}

async function probeState(ao, signer, expected) {
  const msg = await ao.message({
    process: PROCESS_ID,
    signer,
    tags: [
      { name: "Action", value: "Eval" },
      { name: "Content-Type", value: "text/lua" },
      { name: "Probe", value: "state" },
    ],
    data: `
      local buf = buffer or {}
      local holes, count, maxidx = {}, 0, 0
      for i=1,${expected} do
        if buf[i]==nil then holes[#holes+1]=i else count = count + 1 end
      end
      for k,v in pairs(buf) do if type(k)=='number' and k>maxidx then maxidx=k end end
      return string.format("%s|%d|%d", table.concat(holes,","), count, maxidx)
    `,
  });
  const res = await ao.result({ process: PROCESS_ID, message: msg });
  const txt = res?.Output?.data || res?.Output || "";
  const [holesStr, countStr, maxStr] = txt.split("|");
  const holes = holesStr ? holesStr.split(",").filter(Boolean).map(Number) : [];
  return { holes, count: Number(countStr || 0), max: Number(maxStr || 0) };
}

async function main() {
  const signer = await loadSigner();
  const ao = connect({ MODE: "mainnet", URL: HB_URL, MU_URL: HB_URL, CU_URL: HB_URL, SCHEDULER, signer });

  // Prevent duplicate buffers OR resume if requested
  let startIndex = START_INDEX;
  if (AUTO_RESET && !FINALIZE_ONLY) {
    try {
      const resetMsg = await ao.message({
        process: PROCESS_ID,
        signer,
        tags: [
          { name: "Action", value: "Eval" },
          { name: "Content-Type", value: "text/lua" },
          { name: "Reset", value: "true" },
        ],
        data: "buffer=nil; return 'reset'",
      });
      await ao.result({ process: PROCESS_ID, message: resetMsg });
      console.log("Buffer reset on process");
    } catch (err) {
      console.warn("Buffer reset failed (continuing)", err?.message || err);
    }
  } else if (AUTO_RESUME && !FINALIZE_ONLY) {
    try {
      const st = await probeState(ao, signer, 999999);
      const resumeFrom = st.max > 0 ? st.max : st.count;
      if (resumeFrom > 0) {
        startIndex = resumeFrom;
        console.log(`Auto-resume: detected max index ${resumeFrom}, continuing from index ${startIndex}`);
      }
    } catch (err) {
      console.warn("Auto-resume probe failed", err?.message || err);
    }
  }

  let chunks = [];
  if (!FINALIZE_ONLY) {
    const bundle = await readFile(BUNDLE_PATH, "utf8");
    for (let i = 0; i < bundle.length; i += CHUNK_SIZE) {
      chunks.push(bundle.slice(i, i + CHUNK_SIZE));
    }
  }

  const endIndex = MAX_CHUNKS ? Math.min(startIndex + MAX_CHUNKS, chunks.length) : chunks.length;
  const slice = FINALIZE_ONLY ? [] : chunks.slice(startIndex, endIndex);

  if (FINALIZE_ONLY) {
    console.log("FINALIZE_ONLY=true -> skipping chunk upload");
  } else {
    console.log(`Sending ${slice.length} chunks (size ${CHUNK_SIZE}) to ${PROCESS_ID} [slice ${startIndex}..${endIndex - 1}] in batches of ${BATCH_SIZE}`);
  }

  if (!FINALIZE_ONLY && slice.length > 0) {
    let idx = 0;
    while (idx < slice.length) {
      let sentInBatch = 0;
      while (sentInBatch < BATCH_SIZE && idx < slice.length) {
        const absoluteIndex = startIndex + idx;
        const luaIndex = absoluteIndex + 1; // Lua arrays are 1-based
        const code = makeEval(`buffer[${luaIndex}] = [==[${slice[idx]}]==]`);
        let attempt = 0;
        let success = false;
        while (true) {
          try {
            const msgId = await ao.message({
              process: PROCESS_ID,
              signer,
              tags: [
                { name: "Action", value: "Eval" },
                { name: "Content-Type", value: "text/lua" },
                { name: "Chunk-Index", value: String(absoluteIndex) },
              ],
              data: code,
            });
            console.log(`chunk ${absoluteIndex + 1}/${chunks.length} msg`, msgId);
            await ao.result({ process: PROCESS_ID, message: msgId });
            success = true;
            break;
          } catch (sendErr) {
            attempt++;
            console.error(`send/result error on chunk ${absoluteIndex + 1} (attempt ${attempt}):`, sendErr?.message || sendErr);
            if (attempt <= RETRIES) {
              const backoff = RETRY_BACKOFF_MS * attempt;
              console.log(`retrying chunk ${absoluteIndex + 1} after ${backoff}ms...`);
              await sleep(backoff);
              continue;
            }
            // handle failure
            if (AUTO_REPAIR) {
              console.log(`Pausing ${WINDOW_PAUSE_MS / 1000}s then auto-repair...`);
              await sleep(WINDOW_PAUSE_MS);
              try {
                const state = await probeState(ao, signer, startIndex + idx);
                const expected = startIndex + idx;
                if (state.count > expected) {
                  const toTrim = state.count - expected;
                  await trimLast(ao, signer, toTrim);
                  console.log(`Auto-repair: trimmed ${toTrim}, buffer now ${expected}`);
                } else if (state.count < expected) {
                  console.log(`Auto-repair: buffer has ${state.count}, expected ${expected}, resuming from ${state.count}`);
                  idx = Math.max(0, state.count - startIndex);
                  sentInBatch = 0;
                }
              } catch (repErr) {
                console.warn("Auto-repair failed", repErr?.message || repErr);
              }
            }
            if (TRIM_ON_ERROR) {
              try {
                await trimLast(ao, signer, 1);
                console.log("Trimmed last chunk after send error");
              } catch (tErr) {
                console.warn("Trim failed", tErr?.message || tErr);
              }
            }
            if (RESET_ON_ERROR) {
              try {
                const resetMsg = await ao.message({
                  process: PROCESS_ID,
                  signer,
                  tags:[{ name: "Action", value: "Eval" }, { name: "Content-Type", value: "text/lua" }, { name: "Reset", value: "on-error" }],
                  data: "buffer=nil; return 'reset-on-error'",
                });
                await ao.result({ process: PROCESS_ID, message: resetMsg });
                console.log("Buffer reset after send error; aborting run");
              } catch (rErr) {
                console.warn("Reset-on-error failed", rErr?.message || rErr);
              }
              process.exit(1);
            }
            // break batch; retry this chunk in next batch window
            success = false;
            break;
          }
        }

        if (success) {
          idx += 1;
          sentInBatch += 1;
          if (PAUSE_MS > 0) await sleep(PAUSE_MS);
        } else {
          break; // leave batch to pause window / repair
        }
      }

      if (idx < slice.length) {
        // After batch, reconcile buffer count to catch silent drops
        if (BATCH_VERIFY) {
          try {
            const expected = startIndex + idx;
            const state = await probeState(ao, signer, expected);
            if (state.holes.length > 0 || state.count < expected) {
              console.warn(
                `Batch verify: buffer count=${state.count}, expected=${expected}, holes=${state.holes.join(",") || "none"}`
              );
              // rewind to the first missing index
              const rewindTo = state.holes.length > 0 ? state.holes[0] - 1 : state.count;
              idx = Math.max(0, rewindTo - startIndex);
              sentInBatch = 0;
            }
          } catch (vErr) {
            console.warn("Batch verify failed", vErr?.message || vErr);
          }
        }
        console.log(`Batch complete (${idx - startIndex}/${slice.length}); sleeping ${WINDOW_PAUSE_MS / 1000}s for quota/window...`);
        await sleep(WINDOW_PAUSE_MS);
      }
    }
  }

  // Verify buffer size matches expected
  if (VERIFY_COUNT && !FINALIZE_ONLY) {
    try {
      // očekávaný celkový počet = už uložené (startIndex) + právě poslané (slice.length)
      const expectedAbs = startIndex + slice.length;
      const state = await probeState(ao, signer, expectedAbs);
      const countAbs = state.count;
      const holes = state.holes;

      if (countAbs === expectedAbs && holes.length === 0) {
        console.log(`Integrity OK: buffer has ${countAbs} chunks, no holes (expected ${expectedAbs}).`);
      } else {
        console.error(
          `Integrity check failed: count=${countAbs}, expected=${expectedAbs}, holes=${holes.length ? holes.join(',') : 'none'}`
        );

        // auto repair: doposlat chybějící indexy
        if (AUTO_REPAIR && holes.length > 0) {
          for (const h of holes) {
            const idx = h - 1; // zero-based for slice/bundle
            if (idx < 0 || idx >= chunks.length) continue;
            try {
              const chunkData = chunks[idx];
              // Use long-bracket delimiter with level to survive embedded ']]' in chunk data
              const code = makeEval(`buffer[${h}] = [==[${chunkData}]==]`);
              const msgId = await ao.message({
                process: PROCESS_ID,
                signer,
                tags: [
                  { name: "Action", value: "Eval" },
                  { name: "Content-Type", value: "text/lua" },
                  { name: "Chunk-Index", value: String(idx) },
                  { name: "Repair", value: "true" },
                ],
                data: code,
              });
              await ao.result({ process: PROCESS_ID, message: msgId });
              console.log(`Repaired hole at index ${h} (chunk ${idx + 1})`);
            } catch (repErr) {
              console.warn(`Failed to repair hole at ${h}`, repErr?.message || repErr);
              if (RESET_ON_ERROR) {
                // fall back to reset
                const resetMsg = await ao.message({
                  process: PROCESS_ID,
                  signer,
                  tags:[{ name: "Action", value: "Eval" }, { name: "Content-Type", value: "text/lua" }, { name: "Reset", value: "verify-fail" }],
                  data: "buffer=nil; return 'reset-verify'",
                });
                await ao.result({ process: PROCESS_ID, message: resetMsg });
                process.exit(1);
              }
            }
          }
          // re-check after repairs
          const { holes: newHoles, count: newCount } = await probeState(ao, signer, expectedAbs);
          if (newHoles.length === 0 && newCount === expectedAbs) {
            console.log(`Integrity OK after repair: buffer=${newCount}, holes=none.`);
          } else {
            console.error(`Integrity still bad after repair: count=${newCount}, holes=${newHoles.join(',') || 'none'}`);
            process.exit(1);
          }
        } else {
          if (RESET_ON_ERROR) {
            try {
              const resetMsg = await ao.message({
                process: PROCESS_ID,
                signer,
                tags:[{ name: "Action", value: "Eval" }, { name: "Content-Type", value: "text/lua" }, { name: "Reset", value: "verify-fail" }],
                data: "buffer=nil; return 'reset-verify'",
              });
              await ao.result({ process: PROCESS_ID, message: resetMsg });
            } catch (e) {
              console.warn("Reset after verify-fail failed", e?.message || e);
            }
          }
          process.exit(1);
        }
      }
    } catch (probeErr) {
      console.warn("Verify failed", probeErr?.message || probeErr);
      process.exit(1);
    }
  }

  const completedFullRun = !FINALIZE_ONLY && startIndex === 0 && slice.length === chunks.length;
  const completedResume = !FINALIZE_ONLY && startIndex > 0 && (startIndex + slice.length === chunks.length);

  if (FINALIZE && (completedFullRun || completedResume)) {
    console.log("Finalizing...");

    // Guard against contaminated buffer (e.g., probe strings or non-string slots)
    // by validating each chunk before load/exec. When FINALIZE_ONLY is used we
    // don't have local chunks, so probe the remote count as the expected length.
    let expectedChunks = chunks.length;
    if (FINALIZE_ONLY || startIndex > 0) {
      const st = await probeState(ao, signer, chunks.length);
      // clamp to bundle length
      expectedChunks = Math.min(chunks.length, st.max || st.count || chunks.length);
      if (expectedChunks !== chunks.length) {
        throw new Error(`Finalize aborted: remote count/max (${expectedChunks}) != local bundle chunks (${chunks.length})`);
      }
    }

    const finalize = `
      local expected = ${expectedChunks}
      if type(buffer) ~= "table" then error("buffer missing") end
      local parts = {}
      for i = 1, expected do
        local c = buffer[i]
        if type(c) ~= "string" then
          error(string.format("buffer[%d] missing or not string (type=%s)", i, type(c)))
        end
        parts[#parts+1] = c
      end
      local f, err = load(table.concat(parts))
      if not f then error(err) end
      buffer = nil
      return f()
    `;
    const finalMsg = await ao.message({
      process: PROCESS_ID,
      signer,
      tags: [
        { name: "Action", value: "Eval" },
        { name: "Content-Type", value: "text/lua" },
        { name: "Finalize", value: "true" },
      ],
      data: finalize,
    });
    const finalRes = await ao.result({ process: PROCESS_ID, message: finalMsg });
    console.log("final result:", finalRes);
  }

  if (AUTO_FINALIZE && FINALIZE && START_INDEX === 0 && !FINALIZE_ONLY) {
    // Already finalized above
  }
}

main().catch((err) => {
  console.error("fatal", err);
  process.exit(1);
});
