import { parseWalletJson } from "./wallet";

export type AoIdValidation = { ok: true; value: string } | { ok: false; reason: string } | { ok: true; value: "" };
export type WalletFieldValidation = { ok: true; hint?: string } | { ok: false; reason: string };

export const AO_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const TRANSIENT_ERROR_PATTERNS = [
  /timeout/i,
  /temporar/i,
  /network/i,
  /fetch failed/i,
  /ECONN/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /connection.*reset/i,
];

export const isLikelyAoId = (value?: string | null): boolean => AO_ID_PATTERN.test((value ?? "").trim());

export const normalizeEnvValue = (value?: string | null): string | undefined => {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
};

const formatLabel = (label: string, sourceLabel?: string): string =>
  sourceLabel ? `${label} (${sourceLabel})` : label;

export function validateAoId(
  value?: string | null,
  options?: { allowEmpty?: boolean; label?: string; sourceLabel?: string },
): AoIdValidation {
  const label = formatLabel(options?.label ?? "transaction id", options?.sourceLabel);
  const trimmed = (value ?? "").trim();

  if (!trimmed) {
    return options?.allowEmpty ? { ok: true, value: "" } : { ok: false, reason: `${label} is required` };
  }

  if (!AO_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      reason: `${label} should look like an Arweave/ao id (43 chars using letters, numbers, '-' or '_')`,
    };
  }

  return { ok: true, value: trimmed };
}

export function validateWalletPathInput(path?: string | null): WalletFieldValidation {
  const trimmed = (path ?? "").trim();
  if (!trimmed) return { ok: false, reason: "Enter a wallet file path" };

  if (!trimmed.includes("/")) {
    return { ok: true, hint: "Relative path detected; absolute path is recommended" };
  }

  if (!trimmed.toLowerCase().endsWith(".json")) {
    return { ok: true, hint: "Path does not end with .json; confirm it's a wallet key" };
  }

  return { ok: true, hint: "Looks like a wallet path" };
}

export function validateWalletJsonInput(input?: string | Record<string, unknown> | null): WalletFieldValidation {
  if (!input) return { ok: false, reason: "Paste a wallet JWK JSON" };

  const parsed = typeof input === "string" ? parseWalletJson(input) : input;
  if (!parsed) return { ok: false, reason: "Wallet JSON must be valid JSON for a JWK" };

  const looksLikeJwk = typeof (parsed as Record<string, unknown>).kty === "string" ||
    typeof (parsed as Record<string, unknown>).n === "string";

  return looksLikeJwk
    ? { ok: true, hint: "Parsed wallet JSON" }
    : { ok: true, hint: "Parsed JSON; ensure it includes JWK fields like kty" };
}

export const validateModuleTxInput = (
  value?: string | null,
  options?: { allowEmpty?: boolean; sourceLabel?: string },
): AoIdValidation =>
  validateAoId(value, { allowEmpty: options?.allowEmpty ?? false, label: "Module tx id", sourceLabel: options?.sourceLabel });

export const validateSchedulerInput = (
  value?: string | null,
  options?: { allowEmpty?: boolean; sourceLabel?: string },
): AoIdValidation =>
  validateAoId(value, { allowEmpty: options?.allowEmpty ?? true, label: "Scheduler process id", sourceLabel: options?.sourceLabel });

export const validateManifestTxInput = (
  value?: string | null,
  options?: { allowEmpty?: boolean; sourceLabel?: string },
): AoIdValidation =>
  validateAoId(value, { allowEmpty: options?.allowEmpty ?? false, label: "manifestTx", sourceLabel: options?.sourceLabel });

export function classifyAoError(err: unknown): { message: string; transient: boolean } {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const transient = TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  return { message, transient };
}
