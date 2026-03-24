type WalletApi = Window["wallet"];

export type WalletLoadResult =
  | { ok: true; wallet: Record<string, unknown>; path: string }
  | { ok: false; path?: string; error: string };

const walletBridge = (): WalletApi | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.wallet;
};

export async function fetchWalletFromPath(walletPath?: string): Promise<WalletLoadResult> {
  if (!walletPath) {
    return { ok: false, error: "No wallet path provided" };
  }

  const api = walletBridge();
  if (!api?.readWallet) {
    return { ok: false, path: walletPath, error: "Wallet IPC bridge is unavailable in this context" };
  }

  try {
    const { path, wallet } = await api.readWallet(walletPath);
    if (!wallet || typeof wallet !== "object") {
      throw new Error("Wallet JSON is empty or invalid");
    }

    return { ok: true, wallet: wallet as Record<string, unknown>, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to read wallet file";
    return { ok: false, path: walletPath, error: message };
  }
}
