import { resolveEnvWithSettings } from "../storage/settings";

const STATIC_ALLOWLIST = new Set<string>([
  "arweave.net",
  "push.forward.computer",
  "push-1.forward.computer",
  "schedule.forward.computer",
  "api.pwnedpasswords.com",
]);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const collectAllowedHosts = (): Set<string> => {
  const hosts = new Set(STATIC_ALLOWLIST);
  const candidateKeys = [
    "GATEWAY_URL",
    "WORKER_PIP_BASE",
    "WORKER_API_BASE",
    "WORKER_BASE_URL",
    "AO_URL",
    "SCHEDULER_URL",
    "AO_SCHEDULER_URL",
    "AO_SCHEDULER",
  ];

  for (const key of candidateKeys) {
    const value = resolveEnvWithSettings(key);
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.host) hosts.add(url.host.toLowerCase());
      if (url.hostname) hosts.add(url.hostname.toLowerCase());
    } catch {
      // ignore invalid URLs; they will be blocked
    }
  }

  return hosts;
};

const normalizeUrl = (input: RequestInfo | URL, init?: RequestInit): URL | null => {
  if (input instanceof URL) return input;
  if (typeof input === "string") {
    try {
      return new URL(input, typeof window !== "undefined" ? window.location.href : "file://");
    } catch {
      return null;
    }
  }

  if (typeof Request !== "undefined" && input instanceof Request) {
    return new URL(input.url, typeof window !== "undefined" ? window.location.href : "file://");
  }

  return null;
};

const isLocalHost = (host: string) => LOCAL_HOSTS.has(host);

export const explainUrlAllowance = (url: URL, allowlist: Set<string>): { ok: true } | { ok: false; reason: string } => {
  if (url.protocol === "file:" || url.protocol === "about:") {
    return { ok: true };
  }

  if (url.protocol === "data:") {
    return { ok: false, reason: "data: fetch is blocked" };
  }

  const host = url.host.toLowerCase();
  const hostname = url.hostname.toLowerCase();

  if (isLocalHost(hostname)) {
    return { ok: true };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "HTTPS is required for remote hosts" };
  }

  if (!allowlist.has(host) && !allowlist.has(hostname)) {
    return { ok: false, reason: `Host ${host} is not allowlisted` };
  }

  return { ok: true };
};

export const guardFetch = (allowlist: Set<string>, originalFetch: typeof fetch): typeof fetch => {
  return (input: RequestInfo | URL, init?: RequestInit) => {
    const normalized = normalizeUrl(input, init);
    if (normalized) {
      const verdict = explainUrlAllowance(normalized, allowlist);
      if (!verdict.ok) {
        throw new Error(`Blocked fetch to ${normalized.toString()}: ${verdict.reason}`);
      }
    }

    return originalFetch(input as any, init as any);
  };
};

export type AxiosLike = {
  defaults?: { baseURL?: string };
  interceptors: {
    request: {
      use: (onFulfilled: (config: any) => any, onRejected?: (error: any) => any) => void;
    };
  };
};

const resolveAxiosUrl = (config: any): URL | null => {
  const target = config?.url ?? "";
  const base = config?.baseURL ?? config?.defaults?.baseURL;
  try {
    if (base) return new URL(target, base);
    return new URL(target, typeof window !== "undefined" ? window.location.href : "file://");
  } catch {
    return null;
  }
};

export const installAxiosGuard = (axiosInstance: AxiosLike, allowlist: Set<string>) => {
  if (!axiosInstance?.interceptors?.request?.use) return;
  axiosInstance.interceptors.request.use((config: any) => {
    const url = resolveAxiosUrl(config);
    if (url) {
      const verdict = explainUrlAllowance(url, allowlist);
      if (!verdict.ok) {
        const error: any = new Error(`Blocked axios request to ${url.toString()}: ${verdict.reason}`);
        error.code = "ERR_URL_BLOCKED";
        throw error;
      }
    }
    return config;
  });
};

export const installNetworkGuards = (options: { axiosInstance?: AxiosLike } = {}) => {
  const allowlist = collectAllowedHosts();

  if (typeof fetch === "function") {
    const original = fetch.bind(globalThis);
    (globalThis as any).fetch = guardFetch(allowlist, original);
  }

  const candidateAxios = options.axiosInstance ?? (globalThis as any).axios;
  if (candidateAxios) {
    installAxiosGuard(candidateAxios, allowlist);
  }

  return allowlist;
};
