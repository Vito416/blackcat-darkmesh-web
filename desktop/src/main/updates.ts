import { app, BrowserWindow } from "electron";
import { autoUpdater, ProgressInfo, UpdateInfo } from "electron-updater";
import { noArgs, safeHandle } from "./ipcUtil";

type UpdateStatus =
  | { status: "disabled" }
  | { status: "checking" }
  | { status: "available"; info: UpdateInfo }
  | { status: "idle"; info?: UpdateInfo }
  | { status: "downloading"; progress: ProgressInfo }
  | { status: "downloaded"; info: UpdateInfo }
  | { status: "error"; message: string };

const updateChannel = process.env.BLACKCAT_UPDATE_CHANNEL || "latest";
const disableUpdates = process.env.BLACKCAT_DISABLE_AUTO_UPDATE === "1";
let wired = false;
let lastWindow: BrowserWindow | null = null;

const sendStatus = (payload: UpdateStatus) => {
  if (lastWindow && !lastWindow.isDestroyed()) {
    lastWindow.webContents.send("autoUpdate:status", payload);
  }
};

const maybeSetFeedURL = () => {
  const directUrl = process.env.BLACKCAT_UPDATE_URL;
  const baseUrl = process.env.BLACKCAT_UPDATE_BASE_URL;

  if (directUrl) {
    autoUpdater.setFeedURL({ provider: "generic", url: directUrl, channel: updateChannel });
    return;
  }

  if (baseUrl) {
    const trimmed = baseUrl.replace(/\/$/, "");
    const platformSegment = `${process.platform}-${process.arch}`;
    autoUpdater.setFeedURL({ provider: "generic", url: `${trimmed}/${platformSegment}`, channel: updateChannel });
  }
};

export const wireAutoUpdates = (win: BrowserWindow | null) => {
  lastWindow = win;
  if (wired) return;
  wired = true;

  if (!app.isPackaged) {
    console.log("[auto-update] Skipping (development build)");
    return;
  }

  if (disableUpdates) {
    console.log("[auto-update] Disabled via BLACKCAT_DISABLE_AUTO_UPDATE=1");
    sendStatus({ status: "disabled" });
    return;
  }

  autoUpdater.autoDownload = process.env.BLACKCAT_AUTO_DOWNLOAD === "0" ? false : true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = updateChannel !== "latest" || process.env.BLACKCAT_UPDATE_PRERELEASE === "1";
  autoUpdater.channel = updateChannel;
  autoUpdater.logger = console;

  maybeSetFeedURL();

  autoUpdater.on("checking-for-update", () => sendStatus({ status: "checking" }));
  autoUpdater.on("update-available", (info) => sendStatus({ status: "available", info }));
  autoUpdater.on("update-not-available", (info) => sendStatus({ status: "idle", info }));
  autoUpdater.on("error", (err) => {
    const message = err instanceof Error ? err.message : `${err}`;
    console.error("[auto-update] error", err);
    sendStatus({ status: "error", message });
  });
  autoUpdater.on("download-progress", (progress) => sendStatus({ status: "downloading", progress }));
  autoUpdater.on("update-downloaded", (info) => sendStatus({ status: "downloaded", info }));

  queueMicrotask(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      const message = err instanceof Error ? err.message : `${err}`;
      console.error("[auto-update] initial check failed", err);
      sendStatus({ status: "error", message });
    });
  });
};

export const manualCheckForUpdates = async () => {
  if (!app.isPackaged || disableUpdates) {
    return null;
  }
  try {
    return await autoUpdater.checkForUpdates();
  } catch (err) {
    const message = err instanceof Error ? err.message : `${err}`;
    sendStatus({ status: "error", message });
    throw err;
  }
};

export const installDownloadedUpdate = () => {
  if (!app.isPackaged || disableUpdates) {
    return { installed: false, reason: "not-packaged-or-disabled" };
  }
  autoUpdater.quitAndInstall();
  return { installed: true };
};

export const registerUpdateIpc = () => {
  safeHandle("autoUpdate:check", noArgs, async () => {
    return manualCheckForUpdates();
  });

  safeHandle("autoUpdate:install", noArgs, () => installDownloadedUpdate());
};
