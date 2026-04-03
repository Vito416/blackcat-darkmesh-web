import { app, BrowserWindow, dialog } from "electron";
import fs from "fs/promises";
import path from "path";
import net from "net";
import { z } from "zod";
import {
  clearPipVault,
  deletePipVaultRecord,
  describePipVault,
  disableVaultPassword,
  enableVaultPassword,
  exportPipVault,
  importPipVault,
  scanVaultIntegrity,
  listPipVaultRecords,
  readPipVault,
  readPipVaultRecord,
  lockVault,
  writePipVault,
  repairVaultRecord,
  setHardwarePlaceholder,
  recordVaultTelemetry,
} from "./main/pipVault";
import { safeHandle, noArgs } from "./main/ipcUtil";
import { registerUpdateIpc, wireAutoUpdates } from "./main/updates";
import { installRedactedConsole } from "./shared/logging";

const isDev = process.env.NODE_ENV !== "production";
let mainWindow: BrowserWindow | null = null;

installRedactedConsole("main");

async function waitForPort(host: string, port: number, attempts = 50, intervalMs = 200): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const ok = await new Promise<boolean>((resolve) => {
      const socket = net.createConnection({ host, port });
      const cleanup = () => socket.destroy();
      socket.on("connect", () => {
        cleanup();
        resolve(true);
      });
      socket.on("error", () => {
        cleanup();
        resolve(false);
      });
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Renderer dev server not reachable at ${host}:${port}`);
}

const assertWindowSecurity = (win: BrowserWindow) => {
  const prefs = (win.webContents as any).getLastWebPreferences?.() as Electron.WebPreferences | undefined;
  if (!prefs) return;

  if (!prefs.contextIsolation) throw new Error("contextIsolation must remain enabled");
  if (prefs.nodeIntegration) throw new Error("nodeIntegration must remain disabled");
  if ((prefs as any).enableRemoteModule) throw new Error("remote module must remain disabled");
  if (prefs.sandbox === false) throw new Error("sandbox must remain enabled");
};

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#05060d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  assertWindowSecurity(win);

  mainWindow = win;

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  // Block unexpected navigations
  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url.startsWith("file://") ||
      (isDev && url.startsWith("http://localhost:5174")) ||
      (isDev && url.startsWith("http://127.0.0.1:5174"));
    if (!allowed) {
      event.preventDefault();
      console.warn("Blocked navigation to", url);
    }
  });

  // Apply a restrictive CSP on all responses
  const connectSrc = [
    "'self'",
    "https://push.forward.computer",
    "https://push-1.forward.computer",
    "https://schedule.forward.computer",
  ];
  const styleSrc = ["'self'", "'unsafe-inline'"];
  const scriptSrc = ["'self'"];
  const imgSrc = ["'self'", "data:"];
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    const csp = [
      `default-src 'self';`,
      `base-uri 'self';`,
      `object-src 'none';`,
      `frame-ancestors 'none';`,
      `img-src ${imgSrc.join(" ")};`,
      `script-src ${scriptSrc.join(" ")};`,
      `style-src ${styleSrc.join(" ")};`,
      `connect-src ${connectSrc.join(" ")} http://localhost:5174 http://127.0.0.1:5174;`,
      `font-src 'self' data:;`,
      `media-src 'self';`,
      `form-action 'self';`,
    ].join(" ");
    const headers = {
      ...details.responseHeaders,
      "Content-Security-Policy": [csp],
    };
    callback({ responseHeaders: headers });
  });

  win.on("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  win.webContents.on("did-fail-load", (_e, code, desc, validatedURL) => {
    // Log and show a minimal fallback page to avoid a blank/crash perception
    console.error("Renderer failed to load", { code, desc, validatedURL });
    const html = `<html><body style="font-family: sans-serif; background:#05060d; color:#e3e8ff; display:flex; align-items:center; justify-content:center; height:100vh; text-align:center;">
      <div>
        <h2>Renderer failed to load</h2>
        <p>${validatedURL ?? "unknown URL"}</p>
        <p>Code ${code}: ${desc}</p>
        <p>Is Vite dev server running on http://localhost:5174 ?</p>
      </div>
    </body></html>`;
    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
  });

  if (isDev) {
    const devUrl = "http://localhost:5174";
    try {
      await waitForPort("localhost", 5174);
      if (!win.isDestroyed()) {
        await win.loadURL(devUrl);
      }
    } catch (err) {
      console.error("Dev server not reachable before timeout", err);
      if (!win.isDestroyed()) {
        // attempt anyway to see error page or fallback
        await win.loadURL(devUrl).catch((loadErr) => {
          console.error("Load URL failed after timeout", loadErr);
        });
      }
    }
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    if (!win.isDestroyed()) {
      await win.loadFile(path.join(__dirname, "renderer/index.html"));
    }
  }

  return win;
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in main process:", err);
});

app.whenReady().then(async () => {
  registerUpdateIpc();

  const pipRecordId = z.string().trim().min(1, "Record id is required");
  const pipPayload = z.record(z.unknown());
  const vaultPassword = z.string().min(1, "Password is required");
  const optionalPassword = z.string().min(1).optional();

  const kdfSchema = z
    .object({
      algorithm: z.enum(["pbkdf2", "argon2id"]).optional(),
      iterations: z.number().int().positive().optional(),
      salt: z.string().optional(),
      memoryKiB: z.number().int().positive().optional(),
      parallelism: z.number().int().positive().optional(),
      digest: z.string().optional(),
      version: z.number().int().positive().optional(),
    })
    .partial();

  const repairOptionsSchema = z
    .object({
      strategy: z.enum(["rewrap", "quarantine"]).optional(),
      deleteAfter: z.boolean().optional(),
    })
    .partial();

  const hardwarePlaceholderSchema = z.boolean();

  const telemetrySchema = z
    .object({
      event: z.string().trim().min(1),
      at: z.string().optional(),
      detail: z.record(z.unknown()).optional(),
    })
    .strict();

  const passwordOptionsSchema = z
    .object({
      kdf: kdfSchema.optional(),
      hardwarePlaceholder: z.boolean().optional(),
    })
    .partial();

  const walletPathSchema = z.string().trim().min(1, "Wallet path is required");

  safeHandle("pipVault:read", noArgs, async () => {
    return readPipVault();
  });

  safeHandle("pipVault:write", z.tuple([pipPayload]), async ([pip]) => {
    return writePipVault(pip as Parameters<typeof writePipVault>[0]);
  });

  safeHandle("pipVault:clear", noArgs, async () => {
    await clearPipVault();
    return { ok: true };
  });

  safeHandle("pipVault:describe", noArgs, async () => {
    return describePipVault();
  });

  safeHandle("pipVault:list", noArgs, async () => {
    return listPipVaultRecords();
  });

  safeHandle("pipVault:readRecord", z.tuple([pipRecordId]), async ([id]) => {
    return readPipVaultRecord(id);
  });

  safeHandle("pipVault:deleteRecord", z.tuple([pipRecordId]), async ([id]) => {
    return deletePipVaultRecord(id);
  });

  safeHandle("pipVault:enablePassword", z.tuple([vaultPassword, passwordOptionsSchema.optional()]), async ([password, options]) => {
    return enableVaultPassword(password, options as Parameters<typeof enableVaultPassword>[1]);
  });

  safeHandle("pipVault:disablePassword", noArgs, async () => {
    return disableVaultPassword();
  });

  safeHandle("pipVault:lock", noArgs, async () => {
    return lockVault();
  });

  safeHandle("pipVault:export", noArgs, async () => {
    return exportPipVault();
  });

  safeHandle("pipVault:import", z.tuple([z.union([z.string(), z.record(z.unknown())]), optionalPassword]), async ([bundle, password]) => {
    return importPipVault(bundle, password);
  });

  safeHandle("pipVault:scanIntegrity", z.tuple([optionalPassword]), async ([password]) => {
    return scanVaultIntegrity(password);
  });

  safeHandle("pipVault:setHardwarePlaceholder", z.tuple([hardwarePlaceholderSchema]), async ([enabled]) => {
    return setHardwarePlaceholder(enabled);
  });

  safeHandle("pipVault:repairRecord", z.tuple([pipRecordId, repairOptionsSchema.optional()]), async ([id, options]) => {
    return repairVaultRecord(id, options as Parameters<typeof repairVaultRecord>[1]);
  });

  safeHandle("pipVault:telemetry", z.tuple([telemetrySchema]), async ([payload]) => {
    return recordVaultTelemetry(payload as any);
  });

  safeHandle("wallet:read", z.tuple([walletPathSchema]), async ([walletPath]) => {
    const resolvedPath = path.isAbsolute(walletPath) ? walletPath : path.resolve(walletPath);
    const raw = await fs.readFile(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Wallet file must contain a JSON object");
    }

    return { path: resolvedPath, wallet: parsed };
  });

  safeHandle("wallet:select", noArgs, async () => {
    const result = await dialog.showOpenDialog({
      title: "Select Arweave wallet (JWK)",
      properties: ["openFile"],
      filters: [
        { name: "Arweave key", extensions: ["json", "jwk", "txt", "key"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const walletPath = result.filePaths[0];

    try {
      const content = await fs.readFile(walletPath, "utf-8");
      const jwk = JSON.parse(content);
      return { path: walletPath, jwk };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to read wallet file";
      return { path: walletPath, error: message };
    }
  });

  safeHandle("module:pick", noArgs, async () => {
    const result = await dialog.showOpenDialog({
      title: "Select AO module file",
      properties: ["openFile"],
      filters: [
        { name: "JavaScript", extensions: ["js", "mjs", "cjs"] },
        { name: "TypeScript", extensions: ["ts"] },
        { name: "All files", extensions: ["*"] },
      ],
    });

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true };
    }

    const modulePath = result.filePaths[0];

    try {
      const content = await fs.readFile(modulePath, "utf-8");
      return { path: modulePath, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to read module file";
      return { path: modulePath, error: message };
    }
  });

  safeHandle("file:readText", z.tuple([z.string().trim().optional()]), async ([filePath]) => {
    if (!filePath) {
      return { error: "No file path provided" };
    }

    const resolvedPath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);

    try {
      const content = await fs.readFile(resolvedPath, "utf-8");
      return { path: resolvedPath, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to read file";
      return { path: resolvedPath, error: message };
    }
  });

  const win = await createWindow();
  wireAutoUpdates(win);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      const reopened = await createWindow();
      wireAutoUpdates(reopened);
    }
  });
}).catch((err) => {
  console.error("Failed to start app", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
