export type HealthStatus = {
  id: string;
  label: string;
  status: "ok" | "warn" | "error" | "missing";
  detail?: string;
  latencyMs?: number;
  checkedAt: string;
  url?: string;
};

const readEnv = (key: string): string | undefined => {
  const metaEnv = typeof import.meta !== "undefined" ? (import.meta as unknown as { env?: Record<string, string> }).env : undefined;
  const fromMeta = metaEnv?.[key];
  const fromMetaPrefixed = metaEnv?.[`VITE_${key}`];
  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  const fromProcessPrefixed = typeof process !== "undefined" ? process.env?.[`VITE_${key}`] : undefined;

  return fromMeta ?? fromMetaPrefixed ?? fromProcess ?? fromProcessPrefixed;
};

const cleanHost = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "");
  }
};

export async function runHealthChecks(): Promise<HealthStatus[]> {
  const checkedAt = new Date().toISOString();

  const gateway = readEnv("GATEWAY_URL") || "https://arweave.net";
  const worker = readEnv("WORKER_PIP_BASE") || readEnv("WORKER_BASE_URL");
  const aoModule = readEnv("AO_MODULE_TX") || readEnv("VITE_AO_MODULE_TX");
  const walletPath = readEnv("AO_WALLET_PATH");
  const walletJson = readEnv("AO_WALLET_JSON");

  const checks: HealthStatus[] = [
    {
      id: "gateway",
      label: "Gateway",
      status: "ok",
      detail: cleanHost(gateway),
      url: gateway,
      checkedAt,
    },
    {
      id: "worker",
      label: "Worker PIP",
      status: worker ? "ok" : "missing",
      detail: worker ? cleanHost(worker) : "Set WORKER_PIP_BASE",
      url: worker,
      checkedAt,
    },
    {
      id: "module",
      label: "AO module tx",
      status: aoModule ? "ok" : "missing",
      detail: aoModule ?? "Set AO_MODULE_TX",
      url: aoModule ? `https://arweave.net/${aoModule}` : undefined,
      checkedAt,
    },
    {
      id: "wallet",
      label: "Wallet source",
      status: walletJson || walletPath ? "ok" : "missing",
      detail: walletJson ? "AO_WALLET_JSON set" : walletPath ? `Path: ${walletPath}` : "Set AO_WALLET_JSON or AO_WALLET_PATH",
      url: walletPath,
      checkedAt,
    },
  ];

  return checks;
}
