import type { ManifestDocument } from "../types/manifest";
import { fetchWalletFromPath, parseWalletJson } from "./wallet";
import { resolveEnvWithSettings } from "../storage/settings";
import {
  normalizeEnvValue,
  validateManifestTxInput,
  validateModuleTxInput,
  validateSchedulerInput,
} from "./aoValidation";
export {
  AO_ID_PATTERN,
  classifyAoError,
  isLikelyAoId,
  validateAoId,
  validateManifestTxInput,
  validateModuleTxInput,
  validateSchedulerInput,
  validateWalletJsonInput,
  validateWalletPathInput,
  normalizeEnvValue,
  type AoIdValidation,
  type WalletFieldValidation,
} from "./aoValidation";

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


type AoNetworkOptions = {
  offline?: boolean;
};

type EnvCandidate = { value?: string; source?: string; providedEmpty?: boolean };

const pickEnvValue = (...keys: string[]): EnvCandidate => {
  const empties: string[] = [];

  for (const key of keys) {
    const raw = getEnv(key);
    if (raw === undefined) continue;

    const normalized = normalizeEnvValue(raw);
    if (normalized) {
      return { value: normalized, source: key };
    }

    empties.push(key);
  }

  return empties.length ? { value: undefined, source: empties[0], providedEmpty: true } : {};
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
  const envModuleTx = pickEnvValue("AO_MODULE_TX", "VITE_AO_MODULE_TX");
  const moduleOverrideTrimmed = normalizeEnvValue(moduleOverride);
  const moduleTxCandidate = moduleOverrideTrimmed ?? envModuleTx.value;
  const moduleTxValidation = validateModuleTxInput(moduleTxCandidate, {
    allowEmpty: false,
    sourceLabel: moduleOverrideTrimmed ? undefined : envModuleTx.source ? `env ${envModuleTx.source}` : undefined,
  });

  const manifestCandidate = normalizeEnvValue(manifestTx);
  const manifestValidation = validateManifestTxInput(manifestCandidate, { allowEmpty: false });

  const envScheduler = pickEnvValue("SCHEDULER", "VITE_SCHEDULER");
  const schedulerInput = normalizeEnvValue(scheduler);
  const schedulerCandidate = schedulerInput ?? envScheduler.value;
  const schedulerValidation = validateSchedulerInput(schedulerCandidate ?? "", {
    allowEmpty: true,
    sourceLabel:
      !schedulerInput && schedulerCandidate && envScheduler.source ? `env ${envScheduler.source}` : undefined,
  });

  const mergedTags = mergeTags(
    [
      { name: "Type", value: "Process" },
      { name: "Data-Protocol", value: "ao" },
    ],
    [
      ...(schedulerValidation.ok && schedulerValidation.value
        ? [{ name: "Scheduler", value: schedulerValidation.value }]
        : []),
      ...(manifestValidation.ok && manifestValidation.value ? [{ name: "Manifest", value: manifestValidation.value }] : []),
    ],
  );

  if (!moduleTxValidation.ok) {
    const reason = !moduleTxCandidate
      ? envModuleTx.source
        ? `${moduleTxValidation.reason}; set ${envModuleTx.source} or pass a module tx`
        : `${moduleTxValidation.reason}; set AO_MODULE_TX or provide a module tx`
      : envModuleTx.providedEmpty
        ? `${moduleTxValidation.reason}; ${envModuleTx.source} is set but empty`
        : moduleTxValidation.reason;

    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: reason,
      walletPath: wallet.path,
      moduleTx: moduleTxCandidate ?? undefined,
      transient: false,
    };
  }

  const moduleTx = moduleTxValidation.value;

  if (!manifestValidation.ok) {
    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: manifestValidation.reason,
      walletPath: wallet.path,
      moduleTx,
      transient: false,
    };
  }

  if (!schedulerValidation.ok) {
    return {
      processId: null,
      tags: mergedTags,
      placeholder: true,
      note: schedulerValidation.reason,
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
    scheduler: schedulerValidation.value || undefined,
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
