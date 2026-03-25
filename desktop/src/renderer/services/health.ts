import { resolveGatewayUrl } from "./manifestFetch";

type Fetcher = typeof fetch;

export type HealthId = "gateway" | "worker" | "ao";

export type HealthStatus = {
  id: HealthId;
  label: string;
  status: "ok" | "warn" | "error" | "missing";
  detail?: string;
  checkedAt: string;
  latencyMs?: number;
  url?: string;
  lastError?: string;
  lastSuccessAt?: string;
};

const defaultFetch = (globalThis as any).fetch as Fetcher | undefined;

const nowIso = () => new Date().toISOString();
const nowMs = () =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const readEnv = (key: string): string | undefined => {
  if (typeof process !== "undefined" && process.env) {
    return process.env[key] ?? process.env[`VITE_${key}`];
  }
  return undefined;
};

const normalizeBase = (value?: string) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const resolveWorkerBase = () =>
  normalizeBase(readEnv("WORKER_PIP_BASE") ?? readEnv("WORKER_API_BASE") ?? readEnv("WORKER_BASE_URL"));

const resolveAoBase = () => normalizeBase(readEnv("AO_URL"));

const resolvePingTimeoutMs = () => {
  const raw =
    readEnv("HEALTH_PING_TIMEOUT_MS") ??
    readEnv("HEALTH_TIMEOUT_MS") ??
    readEnv("PING_TIMEOUT_MS");
  if (!raw) return 5000;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5000;
  return Math.round(parsed);
};

const buildPingUrl = (base: string, path?: string) => {
  const url = new URL(base);
  const normalizedPath = path?.trim() ? path.trim() : "/health";
  const nextPath = normalizedPath.startsWith("/") ? normalizedPath : `/${normalizedPath}`;
  const prefix = url.pathname.endsWith("/") ? url.pathname.slice(0, -1) : url.pathname;
  url.pathname = `${prefix}${nextPath}`;
  url.search = "";
  return url.toString();
};

const formatHost = (value?: string) => {
  if (!value) return "";
  try {
    return new URL(value).host;
  } catch {
    return value.replace(/^https?:\/\//, "");
  }
};

const makeMissing = (id: HealthId, label: string, detail: string): HealthStatus => ({
  id,
  label,
  status: "missing",
  detail,
  checkedAt: nowIso(),
  lastError: detail,
});

const makeError = (
  id: HealthId,
  label: string,
  url: string,
  checkedAt: string,
  detail: string,
  latencyMs?: number,
  lastError?: string,
): HealthStatus => ({
  id,
  label,
  status: "error",
  detail,
  checkedAt,
  latencyMs,
  url,
  lastError: lastError ?? detail,
});

const makeSuccess = (
  id: HealthId,
  label: string,
  url: string,
  checkedAt: string,
  detail: string,
  latencyMs: number,
  warned?: boolean,
  lastError?: string,
): HealthStatus => ({
  id,
  label,
  status: warned ? "warn" : "ok",
  detail,
  checkedAt,
  latencyMs,
  url,
  lastSuccessAt: checkedAt,
  ...(lastError ? { lastError } : {}),
});

const timeoutDetail = (timeoutMs: number) => `Request timed out after ${Math.round(timeoutMs / 1000)}s`;

const isAbortError = (err: unknown) =>
  err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");

const fetchWithTimeout = async (
  fetcher: Fetcher,
  url: string,
  method: "HEAD" | "GET",
  timeoutMs: number,
) => {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0
      ? globalThis.setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    return await fetcher(url, {
      method,
      headers: { accept: "application/json" },
      signal: controller?.signal,
    });
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
};

const ping = async (
  id: HealthId,
  label: string,
  url: string | undefined,
  fetcher: Fetcher | undefined,
  options?: {
    missingDetail: string;
  },
): Promise<HealthStatus> => {
  if (!url) {
    return makeMissing(id, label, options?.missingDetail ?? "Not configured");
  }

  if (!fetcher) {
    return makeError(id, label, url, nowIso(), "Fetch is not available in this runtime");
  }

  const checkedAt = nowIso();
  const started = nowMs();
  const timeoutMs = resolvePingTimeoutMs();
  const request = async (method: "HEAD" | "GET") => fetchWithTimeout(fetcher, url, method, timeoutMs);

  let headFailure: string | undefined;

  try {
    const headRes = await request("HEAD");
    const headLatencyMs = Math.round(nowMs() - started);

    if (headRes.ok) {
      return makeSuccess(
        id,
        label,
        url,
        checkedAt,
        headRes.statusText || "Reachable (HEAD)",
        headLatencyMs,
      );
    }

    if (headRes.status !== 405 && headRes.status !== 501) {
      return makeError(id, label, url, checkedAt, `HTTP ${headRes.status}`, headLatencyMs);
    }

    headFailure = `HTTP ${headRes.status}`;
  } catch (err) {
    headFailure = isAbortError(err)
      ? timeoutDetail(timeoutMs)
      : err instanceof Error
        ? err.message
        : `${label} HEAD request failed`;
  }

  try {
    const getRes = await request("GET");
    const latencyMs = Math.round(nowMs() - started);

    if (!getRes.ok) {
      const errorDetail = `HTTP ${getRes.status}`;
      return makeError(
        id,
        label,
        url,
        checkedAt,
        errorDetail,
        latencyMs,
        headFailure ? `HEAD failed: ${headFailure}` : errorDetail,
      );
    }

    let detail = getRes.statusText || "Reachable (GET)";
    try {
      const body = (await getRes.json()) as { status?: string; message?: string; ok?: string | boolean };
      if (typeof body?.status === "string" && body.status.trim()) {
        detail = body.status;
      } else if (typeof body?.message === "string" && body.message.trim()) {
        detail = body.message;
      } else if (typeof body?.ok === "boolean") {
        detail = body.ok ? "Healthy" : "Reachable";
      } else if (typeof body?.ok === "string" && body.ok.trim()) {
        detail = body.ok;
      }
    } catch {
      // Not all health endpoints return JSON; plain 2xx is still fine.
    }

    return makeSuccess(
      id,
      label,
      url,
      checkedAt,
      detail,
      latencyMs,
      true,
      headFailure ? `HEAD failed: ${headFailure}` : undefined,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : `${label} request failed`;
    return makeError(
      id,
      label,
      url,
      checkedAt,
      isAbortError(err) ? timeoutDetail(timeoutMs) : message,
      undefined,
      headFailure
        ? `HEAD failed: ${headFailure}; GET failed: ${isAbortError(err) ? timeoutDetail(timeoutMs) : message}`
        : isAbortError(err)
          ? timeoutDetail(timeoutMs)
          : message,
    );
  }
};

export async function checkGatewayHealth(fetcher: Fetcher | undefined = defaultFetch): Promise<HealthStatus> {
  const url = resolveGatewayUrl();
  return ping("gateway", "Gateway", url, fetcher, {
    missingDetail: `Gateway URL is not configured (${formatHost(url) || "arweave.net"})`,
  });
}

export async function checkWorkerHealth(fetcher: Fetcher | undefined = defaultFetch): Promise<HealthStatus> {
  const base = resolveWorkerBase();
  if (!base) {
    return makeMissing("worker", "Worker", "Set WORKER_PIP_BASE / WORKER_BASE_URL to enable health checks");
  }

  const path = readEnv("WORKER_HEALTH_PATH") ?? "/health";
  return ping("worker", "Worker", buildPingUrl(base, path), fetcher, {
    missingDetail: "Set WORKER_PIP_BASE / WORKER_BASE_URL to enable health checks",
  });
}

export async function checkAoHealth(fetcher: Fetcher | undefined = defaultFetch): Promise<HealthStatus> {
  const base = resolveAoBase();
  if (!base) {
    return makeMissing("ao", "AO", "Set AO_URL to enable AO ping");
  }

  const path = readEnv("AO_HEALTH_PATH") ?? readEnv("AO_PING_PATH") ?? "/health";
  const mode = readEnv("AO_MODE");
  const result = await ping("ao", "AO", buildPingUrl(base, path), fetcher, {
    missingDetail: "Set AO_URL to enable AO ping",
  });

  if (result.status === "ok" || result.status === "warn") {
    return {
      ...result,
      detail: mode ? `mode: ${mode}${result.detail ? `; ${result.detail}` : ""}` : result.detail,
    };
  }

  return result;
}

export async function runHealthChecks(fetcher?: Fetcher): Promise<HealthStatus[]> {
  const resolvedFetch = fetcher ?? defaultFetch;

  return Promise.all([
    checkGatewayHealth(resolvedFetch),
    checkWorkerHealth(resolvedFetch),
    checkAoHealth(resolvedFetch),
  ]);
}
