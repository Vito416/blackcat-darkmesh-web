import type { ManifestDocument } from "../types/manifest";
import { fetchWalletFromPath, parseWalletJson } from "./wallet";
import { resolveEnvWithSettings } from "../storage/settings";

type AoClient = Pick<
  typeof import("@permaweb/aoconnect/browser"),
  "connect" | "createDataItemSigner"
>;

let aoClientPromise: Promise<AoClient> | null = null;

// Lazy-load aoconnect to avoid initializing it on app start (and to keep env assumptions isolated)
async function loadAo(): Promise<AoClient> {
  if (!aoClientPromise) {
    aoClientPromise = import("@permaweb/aoconnect/browser").then((mod) => ({
      connect: mod.connect,
      createDataItemSigner: mod.createDataItemSigner,
    }));
  }

  return aoClientPromise;
}

type Tag = { name: string; value: string };

type WalletSource = Record<string, unknown> | string | undefined;

export const AO_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type DeployResponse = {
  txId: string | null;
  tags: Tag[];
  placeholder: boolean;
  raw?: unknown;
  note?: string;
  walletPath?: string;
  transient?: boolean;
};

export type SpawnResponse = {
  processId: string | null;
  tags: Tag[];
  placeholder: boolean;
  raw?: unknown;
  note?: string;
  walletPath?: string;
  moduleTx?: string;
  transient?: boolean;
};

export type AoIdValidation = { ok: true; value: string } | { ok: false; reason: string } | { ok: true; value: "" };

export type WalletFieldValidation = { ok: true; hint?: string } | { ok: false; reason: string };

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

export function validateAoId(value?: string | null, options?: { allowEmpty?: boolean; label?: string }): AoIdValidation {
  const label = options?.label ?? "transaction id";
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

export const validateModuleTxInput = (value?: string | null, options?: { allowEmpty?: boolean }): AoIdValidation =>
  validateAoId(value, { allowEmpty: options?.allowEmpty ?? false, label: "Module tx id" });

export const validateSchedulerInput = (value?: string | null): AoIdValidation =>
  validateAoId(value, { allowEmpty: true, label: "Scheduler process id" });

export function classifyAoError(err: unknown): { message: string; transient: boolean } {
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
  const transient = TRANSIENT_ERROR_PATTERNS.some((pattern) => pattern.test(message));
  return { message, transient };
}

type AoNetworkOptions = {
  offline?: boolean;
};

const baseConnect = async () => {
  const modeEnv = getEnv("AO_MODE");
  const mode: "legacy" | "mainnet" = modeEnv === "mainnet" ? "mainnet" : "legacy";

  const common = {
    GATEWAY_URL: getEnv("GATEWAY_URL"),
    GRAPHQL_URL: getEnv("GRAPHQL_URL"),
    GRAPHQL_MAX_RETRIES: getEnv("GRAPHQL_MAX_RETRIES") ? Number(getEnv("GRAPHQL_MAX_RETRIES")) : undefined,
    GRAPHQL_RETRY_BACKOFF: getEnv("GRAPHQL_RETRY_BACKOFF") ? Number(getEnv("GRAPHQL_RETRY_BACKOFF")) : undefined,
    MU_URL: getEnv("MU_URL"),
    CU_URL: getEnv("CU_URL"),
    SCHEDULER: getEnv("SCHEDULER"),
  };

  const { connect } = await loadAo();
  return mode === "mainnet"
    ? connect({ MODE: "mainnet", ...common })
    : connect({ MODE: "legacy", ...common });
};

export async function deployModule(
  walletOrPath: WalletSource,
  moduleSrc: string,
  tags: Tag[] = [],
  options?: AoNetworkOptions,
): Promise<DeployResponse> {
  const wallet = await resolveWallet(walletOrPath);
  const mergedTags = mergeTags(
    [
      { name: "Type", value: "Module" },
      { name: "Module-Format", value: "javascript" },
      { name: "Input-Encoding", value: "utf-8" },
      { name: "Content-Type", value: "application/javascript" },
      { name: "Data-Protocol", value: "ao" },
    ],
    tags,
  );

  if (options?.offline) {
    return {
      txId: null,
      tags: mergedTags,
      placeholder: true,
      note: "Offline mode is enabled; deploy is blocked",
      walletPath: wallet.path,
      transient: true,
    };
  }

  if (!wallet.ready) {
    return {
      txId: null,
      tags: mergedTags,
      placeholder: true,
      note: wallet.note,
      walletPath: wallet.path,
      transient: false,
    };
  }

  const { createDataItemSigner } = await loadAo();
  const signer = createDataItemSigner(wallet.wallet as Record<string, unknown>);
  const client = await baseConnect();
  const deploy = (client as unknown as { deploy?: Function }).deploy;

  if (!deploy) {
    throw new Error("@permaweb/aoconnect.deploy is unavailable in this build");
  }

  const raw = await deploy({
    signer,
    module: moduleSrc,
    process: moduleSrc,
    tags: mergedTags,
  });

  const txId = typeof raw === "string" ? raw : (raw as { processId?: string; txId?: string; id?: string })?.processId ??
    (raw as { processId?: string; txId?: string; id?: string })?.txId ??
    (raw as { processId?: string; txId?: string; id?: string })?.id ??
    null;

  return { txId, tags: mergedTags, placeholder: false, raw };
}

export async function simulateDeployModule(
  moduleSrc: string,
  tags: Tag[] = [],
  walletPath?: string,
): Promise<DeployResponse> {
  const mergedTags = mergeTags(
    [
      { name: "Type", value: "Module" },
      { name: "Module-Format", value: "javascript" },
      { name: "Input-Encoding", value: "utf-8" },
      { name: "Content-Type", value: "application/javascript" },
      { name: "Data-Protocol", value: "ao" },
      { name: "Dry-Run", value: "true" },
    ],
    tags,
  );

  const txId = `dryrun-${Math.random().toString(36).slice(2, 10)}`;

  return {
    txId,
    tags: mergedTags,
    placeholder: false,
    note: "Dry-run mock gateway (not broadcast)",
    walletPath,
    raw: { dryRun: true, simulated: true, moduleBytes: moduleSrc?.length ?? 0, at: new Date().toISOString() },
    transient: false,
  };
}

export async function spawnProcess(
  scheduler?: string,
  manifestTx?: string,
  moduleOverride?: string,
  walletOrPath?: WalletSource,
  options?: AoNetworkOptions,
): Promise<SpawnResponse> {
  const wallet = await resolveWallet(walletOrPath);
  const moduleTx = moduleOverride?.trim() ?? getEnv("AO_MODULE_TX") ?? getEnv("VITE_AO_MODULE_TX");
  const mergedTags = mergeTags(
    [
      { name: "Type", value: "Process" },
      { name: "Data-Protocol", value: "ao" },
    ],
    [
      ...(scheduler ? [{ name: "Scheduler", value: scheduler }] : []),
      ...(manifestTx ? [{ name: "Manifest", value: manifestTx }] : []),
    ],
  );

  if (!moduleTx) {
    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: "Set AO_MODULE_TX (or VITE_AO_MODULE_TX) before spawning",
      walletPath: wallet.path,
      moduleTx,
      transient: false,
    };
  }

  if (options?.offline) {
    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: "Offline mode is enabled; spawn is blocked",
      walletPath: wallet.path,
      moduleTx,
      transient: true,
    };
  }

  if (!wallet.ready) {
    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: wallet.note,
      walletPath: wallet.path,
      moduleTx,
      transient: false,
    };
  }

  const { createDataItemSigner } = await loadAo();
  const signer = createDataItemSigner(wallet.wallet as Record<string, unknown>);
  const client = await baseConnect();
  const spawn = (client as unknown as { spawn?: Function }).spawn;

  if (!spawn) {
    throw new Error("@permaweb/aoconnect.spawn is unavailable in this build");
  }

  const raw = await spawn({
    module: moduleTx,
    scheduler,
    signer,
    tags: mergedTags,
  });

  const processId = typeof raw === "string" ? raw : (raw as { processId?: string; id?: string })?.processId ??
    (raw as { processId?: string; id?: string })?.id ??
    null;

  return { processId, tags: mergedTags, placeholder: false, raw, moduleTx };
}

export function serializeManifest(manifest: ManifestDocument): string {
  return JSON.stringify(manifest, null, 2);
}

type WalletResolution =
  | { ready: true; wallet: Record<string, unknown>; path?: string; note?: string }
  | { ready: false; wallet?: null; path?: string; note?: string };

async function resolveWallet(walletOrPath?: WalletSource): Promise<WalletResolution> {
  if (walletOrPath && typeof walletOrPath !== "string") {
    return { ready: true, wallet: walletOrPath, note: "Using provided JWK object" };
  }

  const jsonCandidate = typeof walletOrPath === "string" ? walletOrPath : getEnv("AO_WALLET_JSON");
  const parsed = parseWalletJson(jsonCandidate);

  if (parsed) {
    return { ready: true, wallet: parsed, note: "Parsed wallet JSON" };
  }

  const path = typeof walletOrPath === "string" ? walletOrPath : getEnv("AO_WALLET_PATH");

  if (path) {
    const result = await fetchWalletFromPath(path);

    if (result.ok) {
      return { ready: true, wallet: result.wallet, path: result.path, note: `Loaded wallet from ${result.path}` };
    }

    return {
      ready: false,
      wallet: null,
      path: result.path ?? path,
      note: result.error,
    };
  }

  return { ready: false, wallet: null, note: "Pass a JWK JSON or set AO_WALLET_PATH" };
}

function mergeTags(base: Tag[], user: Tag[]): Tag[] {
  const merged = new Map<string, Tag>();

  [...base, ...user].forEach((tag) => {
    merged.set(tag.name, tag);
  });

  return Array.from(merged.values());
}

function getEnv(key: string): string | undefined {
  return resolveEnvWithSettings(key);
}
