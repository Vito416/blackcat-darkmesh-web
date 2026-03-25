import * as pipClient from "../../../../src/manifest/pipClient";

import { normalizePipInput, validatePipDocument, type PipDocument } from "./pipValidation";
import {
  clearPipVault,
  deletePipVaultRecord as deletePipVaultRecordImpl,
  listPipVaultRecords as listPipVaultRecordsImpl,
  readPipVault,
  loadPipVaultRecord,
  writePipVault,
  type PipVaultRecord,
} from "./pipVault";

export type PipLoadResult =
  | { ok: true; pip: PipDocument; source: "prompt" | "worker" | "vault" }
  | { ok: false; error: string };

const asError = (err: unknown, fallback: string): string => (err instanceof Error ? err.message : fallback);

export async function loadPipFromPrompt(raw: string): Promise<PipLoadResult> {
  const parsed = normalizePipInput(raw);
  if (!parsed.ok) {
    return parsed;
  }

  return { ok: true, pip: parsed.pip, source: "prompt" };
}

export async function loadPipFromWorker(
  tenant: string,
  site: string,
  subject?: string,
  nonce?: string,
): Promise<PipLoadResult> {
  try {
    const pip = subject && nonce ? await pipClient.fetchPip(subject, nonce) : await pipClient.getLatestPip(tenant, site);
    const validated = validatePipDocument(pip);

    if (!validated.ok) {
      return validated;
    }

    return { ok: true, pip: validated.pip, source: "worker" };
  } catch (err) {
    return { ok: false, error: asError(err, "Failed to fetch PIP") };
  }
}

export async function loadPipFromVault(): Promise<PipLoadResult> {
  const result = await readPipVault();
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const validated = validatePipDocument(result.pip);
  if (!validated.ok) {
    return validated;
  }

  return { ok: true, pip: validated.pip, source: "vault" };
}

export async function loadPipFromVaultRecord(id: string): Promise<PipLoadResult> {
  const result = await loadPipVaultRecord(id);
  if (!result.ok) {
    return { ok: false, error: "No PIP vault record found" };
  }

  const validated = validatePipDocument(result.pip);
  if (!validated.ok) {
    return validated;
  }

  return { ok: true, pip: validated.pip, source: "vault" };
}

export async function listPipVaultRecords(): Promise<{ ok: true; records: PipVaultRecord[] } | { ok: false; error: string }> {
  const result = await listPipVaultRecordsImpl();
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  return { ok: true, records: result.records };
}

export async function savePipToVault(pip: PipDocument): Promise<{ ok: true; updatedAt: string } | { ok: false; error: string }> {
  return writePipVault(pip);
}

export async function clearPipVaultStorage(): Promise<{ ok: true } | { ok: false; error: string }> {
  return clearPipVault();
}

export async function deletePipVaultRecordStorage(id: string): Promise<{ ok: true; removed: boolean } | { ok: false; error: string }> {
  return deletePipVaultRecordImpl(id);
}
