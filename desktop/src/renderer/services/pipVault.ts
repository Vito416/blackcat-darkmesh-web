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
      recordCount: number;
    }
  | { ok: false; error: string };

export type PipVaultExportSuccess = {
  ok: true;
  bundle: string;
  checksum: string;
  bytes: number;
  createdAt: string;
  recordCount: number;
};

export type PipVaultExportResult = PipVaultExportSuccess | { ok: false; error: string };

export type PipVaultIntegrityIssue = { id: string; error: string };

export type PipVaultIntegrityResult =
  | { ok: true; scanned: number; failed: PipVaultIntegrityIssue[]; durationMs: number; recordCount: number }
  | { ok: false; error: string };

const bridge = (): PipVaultBridge | undefined => {
  if (typeof window === "undefined") return undefined;
  return window.pipVault;
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
    return { ok: true, ...(await api.describe()) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to inspect PIP vault",
    };
  }
}

export async function enableVaultPassword(
  password: string,
): Promise<{ ok: true; mode: string; iterations?: number; salt?: string; records?: number } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.enablePasswordMode) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.enablePasswordMode(password);
    return result as { ok: true; mode: string; iterations?: number; salt?: string; records?: number };
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
): Promise<{ ok: true; mode: string; records: number } | { ok: false; error: string }> {
  const api = bridge();
  if (!api?.importVault) {
    return { ok: false, error: "PIP vault IPC bridge is unavailable" };
  }

  try {
    const result = await api.importVault(bundle, password);
    return result as { ok: true; mode: string; records: number };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to import PIP vault",
    };
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
