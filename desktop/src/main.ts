import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";
import net from "net";
import { clearPipVault, describePipVault, readPipVault, writePipVault } from "./main/pipVault";

const isDev = process.env.NODE_ENV !== "production";

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

async function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    backgroundColor: "#05060d",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));

  win.on("ready-to-show", () => {
    if (!win.isDestroyed()) win.show();
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
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in main process:", err);
});

app.whenReady().then(() => {
  ipcMain.handle("pipVault:read", async () => {
    return readPipVault();
  });

  ipcMain.handle("pipVault:write", async (_event, pip: unknown) => {
    if (!pip || typeof pip !== "object") {
      throw new Error("PIP payload must be an object");
    }

    return writePipVault(pip as Parameters<typeof writePipVault>[0]);
  });

  ipcMain.handle("pipVault:clear", async () => {
    await clearPipVault();
    return { ok: true };
  });

  ipcMain.handle("pipVault:describe", async () => {
    return describePipVault();
  });

  ipcMain.handle("wallet:read", async (_event, walletPath: unknown) => {
    if (typeof walletPath !== "string" || !walletPath.trim()) {
      throw new Error("Invalid wallet path");
    }

    const resolvedPath = path.isAbsolute(walletPath) ? walletPath : path.resolve(walletPath);
    const raw = await fs.readFile(resolvedPath, "utf-8");
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      throw new Error("Wallet file must contain a JSON object");
    }

    return { path: resolvedPath, wallet: parsed };
  });

  ipcMain.handle("wallet:select", async () => {
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

  ipcMain.handle("module:pick", async () => {
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

  ipcMain.handle("file:readText", async (_event, filePath: unknown) => {
    if (typeof filePath !== "string" || !filePath.trim()) {
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

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error("Failed to start app", err);
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
