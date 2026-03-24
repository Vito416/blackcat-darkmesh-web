import { contextBridge, ipcRenderer } from "electron";

type WalletResponse = { path: string; wallet: Record<string, unknown> };

const walletApi = {
  readWallet: async (walletPath: string): Promise<WalletResponse> => {
    return ipcRenderer.invoke("wallet:read", walletPath);
  },
};

contextBridge.exposeInMainWorld("wallet", walletApi);

contextBridge.exposeInMainWorld("desktop", {
  selectWallet: () => ipcRenderer.invoke("wallet:select"),
  pickModuleFile: () => ipcRenderer.invoke("module:pick"),
  readTextFile: (path: string) => ipcRenderer.invoke("file:readText", path),
});

export {};
