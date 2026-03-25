import { ManifestDocument } from "../types/manifest";
import { resolveEnvWithSettings } from "../storage/settings";

const DEFAULT_GATEWAY = "https://arweave.net";

const getEnv = (key: string): string | undefined => resolveEnvWithSettings(key);

const normalizeBase = (value?: string) => {
  const base = (value ?? DEFAULT_GATEWAY).trim() || DEFAULT_GATEWAY;
  return base.endsWith("/") ? base.slice(0, -1) : base;
};

export const resolveGatewayUrl = (): string => {
  return normalizeBase(getEnv("GATEWAY_URL"));
};

/**
 * Fetch a manifest document (JSON) from the configured gateway.
 * Falls back to https://arweave.net when no env override is provided.
 */
export async function fetchManifestDocument(
  manifestTx: string,
  fetcher: typeof fetch | undefined = (globalThis as any).fetch,
  options?: { offline?: boolean },
): Promise<ManifestDocument> {
  const tx = manifestTx.trim();
  if (!tx) throw new Error("manifestTx is required");

  if (options?.offline) {
    throw new Error("Offline mode is enabled; manifest fetch is blocked");
  }

  if (!fetcher) throw new Error("Fetch is not available in this runtime");

  const url = `${resolveGatewayUrl()}/${encodeURIComponent(tx)}`;
  let res: Response;

  try {
    res = await fetcher(url, { method: "GET", headers: { accept: "application/json" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    throw new Error(`Manifest fetch failed for ${tx} at ${url}: ${message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const suffix = detail ? ` - ${detail.slice(0, 180)}` : "";
    throw new Error(`Manifest fetch failed for ${tx}: HTTP ${res.status}${suffix}`);
  }

  try {
    return (await res.json()) as ManifestDocument;
  } catch (err) {
    throw new Error(`Gateway response for ${tx} was not valid JSON`);
  }
}
