export {};

declare global {
  interface Window {
    wallet?: {
      readWallet: (walletPath: string) => Promise<{ path: string; wallet: Record<string, unknown> }>;
    };
  }
}
