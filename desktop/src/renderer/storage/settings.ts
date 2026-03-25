export type UserSettings = {
  gatewayUrl?: string;
  workerUrl?: string;
  aoUrl?: string;
  walletPath?: string;
  walletJson?: string;
  sampleLoaded?: boolean;
  completedAt?: string;
};

const SETTINGS_STORAGE_KEY = "darkmesh-user-settings";
const SETUP_FLAG_KEY = "darkmesh-setup-complete";

const ENV_KEY_MAP: Record<string, keyof UserSettings> = {
  GATEWAY_URL: "gatewayUrl",
  VITE_GATEWAY_URL: "gatewayUrl",
  WORKER_PIP_BASE: "workerUrl",
  WORKER_API_BASE: "workerUrl",
  WORKER_BASE_URL: "workerUrl",
  AO_URL: "aoUrl",
  AO_WALLET_PATH: "walletPath",
  VITE_AO_WALLET_PATH: "walletPath",
  AO_WALLET_JSON: "walletJson",
  VITE_AO_WALLET_JSON: "walletJson",
};

let cache: UserSettings | null = null;

const readFromStorage = (): UserSettings => {
  if (cache) return cache;
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      cache = {};
      return cache;
    }

    const parsed = JSON.parse(raw) as UserSettings;
    cache = parsed && typeof parsed === "object" ? parsed : {};
    return cache;
  } catch {
    cache = {};
    return cache;
  }
};

const writeToStorage = (next: UserSettings): UserSettings => {
  cache = next;
  if (typeof window === "undefined") return next;

  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable; ignore in that case.
  }

  return next;
};

export const loadSettings = (): UserSettings => ({ ...readFromStorage() });

export const saveSettings = (update: Partial<UserSettings>): UserSettings => {
  const current = readFromStorage();
  const next = writeToStorage({ ...current, ...update });
  return next;
};

export const clearSettings = (): void => {
  cache = {};
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(SETTINGS_STORAGE_KEY);
  } catch {
    // ignore
  }
};

export const resolveSettingHint = (key: string): string | undefined => {
  const settings = readFromStorage();
  const mapped = ENV_KEY_MAP[key];
  if (!mapped) return undefined;
  const value = settings[mapped];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

export const resolveEnvWithSettings = (key: string): string | undefined => {
  const hint = resolveSettingHint(key);
  if (hint) return hint;

  const fromProcess = typeof process !== "undefined" ? process.env?.[key] : undefined;
  const fromProcessPrefixed = typeof process !== "undefined" ? process.env?.[`VITE_${key}`] : undefined;

  return fromProcess ?? fromProcessPrefixed;
};

export const hasStoredSettings = (): boolean => {
  const settings = readFromStorage();
  return Boolean(settings.gatewayUrl || settings.workerUrl || settings.aoUrl || settings.walletPath || settings.walletJson);
};

export const setupCompleted = (): boolean => {
  if (typeof window === "undefined") return true;

  const settings = readFromStorage();
  if (settings.completedAt) return true;

  try {
    return window.localStorage.getItem(SETUP_FLAG_KEY) === "1";
  } catch {
    return false;
  }
};

export const markSetupComplete = (): void => {
  const timestamp = new Date().toISOString();
  saveSettings({ completedAt: timestamp });

  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SETUP_FLAG_KEY, "1");
  } catch {
    // ignore storage issues
  }
};
