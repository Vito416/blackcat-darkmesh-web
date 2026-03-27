import type { PipDocument } from "./pipValidation";

type PipVaultBridge = Window["pipVault"];

export type PipVaultRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  manifestTx: string;
  tenant?: string;
  site?: string;
};

export type PipVaultReadResult =
  | { ok: true; pip: PipDocument; updatedAt?: string; exists: true }
  | { ok: false; error: string; exists?: false };

export type PipVaultDescribeResult =
  | {
      ok: true;
      exists: boolean;
      updatedAt?: string;
      encrypted: boolean;
      path: string;
      mode: "safeStorage" | "plain" | "password";
      iterations?: number;
      salt?: string;
      locked: boolean;
      lockedAt?: string;
      recordCount: number;
      kdf?: PipVaultKdfMeta;
      hardwarePlaceholder?: boolean;
    }
  | { ok: false; error: string };

export type PipVaultExportSuccess = {
  ok: true;
  bundle: string;
  checksum: string;
  bytes: number;
  createdAt: string;
  recordCount: number;
  kdf?: PipVaultKdfMeta;
  hardwarePlaceholder?: boolean;
};

export type PipVaultExportResult = PipVaultExportSuccess | { ok: false; error: string };

export type PipVaultIntegrityIssue = { id: string; error: string };

export type PipVaultIntegrityResult =
  | { ok: true; scanned: number; failed: PipVaultIntegrityIssue[]; durationMs: number; recordCount: number }
  | { ok: false; error: string };

export type PipVaultBundleMeta = {
  format?: string;
  mode?: "safeStorage" | "plain" | "password";
  createdAt?: string;
  recordCount?: number;
  kdf?: PipVaultKdfMeta;
};

export type PipVaultKdfMeta = {
  algorithm: "pbkdf2" | "argon2id";
  iterations?: number;
  salt?: string;
  memoryKiB?: number;
  parallelism?: number;
  digest?: string;
  version?: number;
};

export type PipVaultRepairResult =
  | { ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string }
  | { ok: false; error: string };

export type VaultTelemetryEvent = { event: string; at?: string; detail?: Record<string, unknown> };

const bridge = (): PipVaultBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.pipVault;
};

const normalizeKdfMeta = (
  value: { kdf?: PipVaultKdfMeta; iterations?: number; salt?: string; algorithm?: PipVaultKdfMeta["algorithm"]; memoryKiB?: number; parallelism?: number },
): PipVaultKdfMeta | undefined => {
  if (value.kdf) return value.kdf;
  if (value.iterations || value.salt || value.algorithm || value.memoryKiB || value.parallelism) {
    return {
      algorithm: value.algorithm ?? "pbkdf2",
      iterations: value.iterations,
      salt: value.salt,
      memoryKiB: value.memoryKiB,
      parallelism: value.parallelism,
      digest: value.algorithm === "argon2id" ? undefined : "sha256",
      version: 1,
    };
  }
  return undefined;
};

export async function readPipVault(): Promise<PipVaultReadResult> {
  const api = bridge();
  if (!api?.read) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.read();
    if (!result.exists || !result.pip) {
      return { ok: false, error: "No PIP vault found", exists: false };
    }

    return { ok: true, pip: result.pip as PipDocument, updatedAt: result.updatedAt, exists: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to read PIP vault",
    };
  }
}

export async function writePipVault(pip: PipDocument): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.write) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.write(pip as Record<string, unknown>);
    return { ok: true, updatedAt: result.updatedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to write PIP vault",
    };
  }
}

export async function listPipVaultRecords(): Promise<{ ok: true; records: PipVaultRecord[] } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.list) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.list();
    return { ok: true, records: result.records ?? [] };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to list PIP vault records",
    };
  }
}

export async function loadPipVaultRecord(id: string): Promise<PipVaultReadResult> {
  const api = bridge();
  if (!api?.loadRecord) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.loadRecord(id);
    if (!result.exists || !result.pip) {
      return { ok: false, error: "No PIP vault record found", exists: false };
    }

    return { ok: true, pip: result.pip as PipDocument, updatedAt: result.updatedAt, exists: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to load PIP vault record",
    };
  }
}

export async function deletePipVaultRecord(id: string): Promise<{ ok: true; removed: boolean } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.deleteRecord) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.deleteRecord(id);
    return { ok: true, removed: Boolean(result.removed) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to delete PIP vault record",
    };
  }
}

export async function clearPipVault(): Promise<{ ok: true } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.clear) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    await api.clear();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to clear PIP vault",
    };
  }
}

export async function describePipVault(): Promise<PipVaultDescribeResult> {
  const api = bridge();
  if (!api?.describe) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.describe();
    const kdf = normalizeKdfMeta(result);
    return { ok: true, ...result, ...(kdf ? { kdf } : {}) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to inspect PIP vault",
    };
  }
}

export async function enableVaultPassword(
  password: string,
  options?: { kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean },
): Promise<
  | { ok: true; mode: string; kdf?: PipVaultKdfMeta; records?: number; hardwarePlaceholder?: boolean }
  | { ok: false; error: string }
> {
  const api = bridge();
  if (!api?.enablePasswordMode) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.enablePasswordMode(password, options);
    return {
      ...(result as { ok: true; mode: string; records?: number; hardwarePlaceholder?: boolean; kdf?: PipVaultKdfMeta }),
      ok: true,
      kdf: normalizeKdfMeta(result) ?? (result as { kdf?: PipVaultKdfMeta }).kdf,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to enable password mode",
    };
  }
}

export async function disableVaultPassword(): Promise<{ ok: true; mode: string } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.disablePasswordMode) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.disablePasswordMode();
    return result as { ok: true; mode: string };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to disable password mode",
    };
  }
}

export async function exportPipVaultBundle(): Promise<PipVaultExportResult> {
  const api = bridge();
  if (!api?.exportVault) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = (await api.exportVault()) as PipVaultExportSuccess;
    return {
      ok: true,
      bundle: result.bundle,
      checksum: result.checksum,
      bytes: result.bytes,
      createdAt: result.createdAt,
      recordCount: result.recordCount,
      kdf: result.kdf ?? normalizeKdfMeta(result),
      hardwarePlaceholder: result.hardwarePlaceholder,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to export PIP vault",
    };
  }
}

export async function importPipVaultBundle(
  bundle: string | ArrayBuffer,
  password?: string,
): Promise<{ ok: true; mode: string; records: number; kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.importVault) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.importVault(bundle, password);
    return {
      ...(result as { ok: true; mode: string; records: number; kdf?: PipVaultKdfMeta; hardwarePlaceholder?: boolean }),
      kdf: normalizeKdfMeta(result) ?? (result as { kdf?: PipVaultKdfMeta }).kdf,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to import PIP vault",
    };
  }
}

export async function lockPipVault(): Promise<{ ok: true; locked: boolean; lockedAt?: string } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.lock) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.lock();
    return { ok: true, locked: Boolean((result as { locked?: boolean }).locked), lockedAt: (result as { lockedAt?: string }).lockedAt };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to lock PIP vault",
    };
  }
}

export async function repairPipVaultRecord(
  id: string,
  options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean },
): Promise<PipVaultRepairResult> {
  const api = bridge();
  if (!api?.repairRecord) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.repairRecord(id, options);
    return result as PipVaultRepairResult;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unable to repair vault record" };
  }
}

export async function setVaultHardwarePlaceholder(enabled: boolean): Promise<{ ok: true; hardwarePlaceholder: boolean } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.setHardwarePlaceholder) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    return (await api.setHardwarePlaceholder(enabled)) as { ok: true; hardwarePlaceholder: boolean };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unable to persist hardware placeholder" };
  }
}

export async function sendVaultTelemetry(event: VaultTelemetryEvent): Promise<void> {
  const api = bridge();
  if (!api?.telemetry) return;
  try {
    await api.telemetry(event);
  } catch {
    // Ignore telemetry failures to avoid blocking UX
  }
}

export function inspectVaultBundle(
  input: string | ArrayBuffer,
): { ok: true; meta: PipVaultBundleMeta } | { ok: false; error: string } {
  try {
    const text =
      typeof input === "string"
        ? input
        : new TextDecoder().decode(input instanceof ArrayBuffer ? new Uint8Array(input) : input);
    const parsed = JSON.parse(text);
    if (parsed?.format !== "pip-vault-bundle") {
      return { ok: false, error: "Selected file is not a vault backup bundle" };
    }

    const bundleKdf = parsed.kdf ?? parsed.key?.kdf;
    const meta: PipVaultBundleMeta = {
      format: parsed.format,
      mode: parsed.mode,
      createdAt: parsed.createdAt,
      recordCount: parsed.records ?? parsed.recordCount,
      kdf: normalizeKdfMeta({ kdf: bundleKdf }),
    };

    return { ok: true, meta };
  } catch (err) {
    return { ok: false, error: "Invalid vault bundle JSON" };
  }
}

export async function scanPipVaultIntegrity(password?: string): Promise<PipVaultIntegrityResult> {
  const api = bridge();
  if (!api?.scanIntegrity) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.scanIntegrity(password);
    return result as PipVaultIntegrityResult;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to scan PIP vault",
    };
  }
}
