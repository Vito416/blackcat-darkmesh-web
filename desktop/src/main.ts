import { app, BrowserWindow, dialog, ipcMain } from "electron";
import fs from "fs/promises";
import path from "path";

const isDev = process.env.NODE_ENV !== "production";

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5174");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "renderer/index.html"));
  }
}

app.whenReady().then(() => {
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
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
