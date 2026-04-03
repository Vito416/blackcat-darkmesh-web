const SECRET_KEYS = ["password", "secret", "token", "key", "jwk", "mnemonic", "private", "wallet"];

const PRIVATE_KEY_PATTERN = /-----BEGIN[^-]+PRIVATE KEY-----[\s\S]*?-----END[^-]+PRIVATE KEY-----/gi;
const LONG_HEX_PATTERN = /\b[0-9a-fA-F]{32,}\b/g;
const BASE64ISH_PATTERN = /\b[A-Za-z0-9+/]{32,}={0,2}\b/g;

const maskToken = (value: string) => {
  if (value.length <= 12) return "[redacted]";
  return `${value.slice(0, 6)}…[redacted]…${value.slice(-4)}`;
};

const redactString = (value: string): string => {
  let result = value;
  result = result.replace(PRIVATE_KEY_PATTERN, "[redacted-private-key]");
  result = result.replace(LONG_HEX_PATTERN, (match) => maskToken(match));
  result = result.replace(BASE64ISH_PATTERN, (match) => maskToken(match));
  return result;
};

const shouldRedactKey = (key: string) => SECRET_KEYS.some((candidate) => key.toLowerCase().includes(candidate));

const redactObject = (value: Record<string, unknown>): Record<string, unknown> => {
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (shouldRedactKey(key)) {
      next[key] = "[redacted]";
      continue;
    }
    next[key] = redactValue(raw);
  }
  return next;
};

export const redactValue = (value: unknown): unknown => {
  if (typeof value === "string") return redactString(value);
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (value instanceof Error) {
    return new Error(redactString(value.message));
  }
  if (typeof value === "object") return redactObject(value as Record<string, unknown>);
  return value;
};

export const installRedactedConsole = (scope: string): (() => void) => {
  const methods: (keyof Console)[] = ["log", "info", "warn", "error", "debug"];
  const originals = new Map<keyof Console, (...args: any[]) => void>();

  for (const method of methods) {
    const fn = console[method];
    if (typeof fn === "function") {
      originals.set(method, (fn as (...args: any[]) => void).bind(console));
    }
  }

  const wrap = (method: keyof Console) =>
    (...args: unknown[]) => {
      const original = originals.get(method);
      if (!original) return;
      const cleaned = args.map((arg) => redactValue(arg));
      original(`[${scope}]`, ...cleaned);
    };

  for (const method of methods) {
    if (originals.has(method)) {
      // eslint-disable-next-line no-console
      (console as any)[method] = wrap(method);
    }
  }

  return () => {
    for (const [method, original] of originals.entries()) {
      // eslint-disable-next-line no-console
      (console as any)[method] = original;
    }
  };
};
