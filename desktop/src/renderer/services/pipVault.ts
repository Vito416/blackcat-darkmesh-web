import type { PipDocument } from "./pipValidation";

type PipVaultBridge = Window["pipVault"];

export type PipVaultReadResult =
  | { ok: true; pip: PipDocument; updatedAt?: string; exists: true }
  | { ok: false; error: string; exists?: false };

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

export async function describePipVault(): Promise<
  | { ok: true; exists: boolean; updatedAt?: string; encrypted: boolean; path: string }
  | { ok: false; error: string }
> {
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
