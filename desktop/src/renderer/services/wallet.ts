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
    const parsed = parseWalletJson(wallet);
    if (!parsed) {
      throw new Error("Wallet JSON is empty or invalid");
    }

    return { ok: true, wallet: parsed, path };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to read wallet file";
    return { ok: false, path: walletPath, error: message };
  }
}

export function parseWalletJson(input: unknown): Record<string, unknown> | null {
  if (!input) return null;

  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
