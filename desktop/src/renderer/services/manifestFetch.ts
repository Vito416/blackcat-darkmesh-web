import { ManifestDocument } from "../types/manifest";

const DEFAULT_GATEWAY = "https://arweave.net";

const getEnv = (key: string): string | undefined => {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? process.env[`VITE_${key}`];
  }
  return undefined;
};

const normalizeBase = (value?: string) => {
  const base = (value ?? DEFAULT_GATEWAY).trim() || DEFAULT_GATEWAY;
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

export const resolveGatewayUrl = (): string => {
  return normalizeBase(getEnv("VITE_GATEWAY_URL") ?? getEnv("GATEWAY_URL"));
};

/**
 * Fetch a manifest document (JSON) from the configured gateway.
 * Falls back to https://arweave.net when no env override is provided.
 */
export async function fetchManifestDocument(
  manifestTx: string,
  fetcher: typeof fetch | undefined = (globalThis as any).fetch,
): Promise<ManifestDocument> {
  const tx = manifestTx.trim();
  if (!tx) throw new Error("manifestTx is required");

  if (!fetcher) throw new Error("Fetch is not available in this runtime");

  const url = `${resolveGatewayUrl()}/${encodeURIComponent(tx)}`;
  const res = await fetcher(url, { method: "GET", headers: { accept: "application/json" } });

  if (!res.ok) {
    throw new Error(`Manifest fetch failed: HTTP ${res.status}`);
  }

  try {
    return (await res.json()) as ManifestDocument;
  } catch (err) {
    throw new Error("Gateway response was not valid JSON");
  }
}
