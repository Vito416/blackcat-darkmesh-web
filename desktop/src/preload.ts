import { contextBridge, ipcRenderer } from "electron";

type WalletResponse = { path: string; wallet: Record<string, unknown> };
type PipVaultReadResult = { exists: boolean; updatedAt?: string; pip?: Record<string, unknown> };
type PipVaultDescribeResult = { exists: boolean; updatedAt?: string; encrypted: boolean; path: string };

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

contextBridge.exposeInMainWorld("pipVault", {
  read: (): Promise<PipVaultReadResult> => ipcRenderer.invoke("pipVault:read"),
  write: (pip: Record<string, unknown>) => ipcRenderer.invoke("pipVault:write", pip),
  clear: (): Promise<{ ok: true }> => ipcRenderer.invoke("pipVault:clear"),
  describe: (): Promise<PipVaultDescribeResult> => ipcRenderer.invoke("pipVault:describe"),
});

export {};
