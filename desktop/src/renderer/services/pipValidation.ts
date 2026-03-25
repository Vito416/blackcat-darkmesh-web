export interface PipDocument {
  tenant?: string;
  site?: string;
  manifestTx: string;
  [key: string]: unknown;
}

export type PipValidationResult =
  | { ok: true; pip: PipDocument }
  | { ok: false; error: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

const ensureManifestTx = (value: unknown): string => {
  const tx = cleanText(value);
  if (!tx) {
    throw new Error("PIP is missing manifestTx");
  }
  return tx;
};

export function validatePipDocument(value: unknown): PipValidationResult {
  try {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new Error("PIP input is empty");
      }

      if (trimmed.startsWith("{")) {
        return validatePipDocument(JSON.parse(trimmed));
      }

      return { ok: true, pip: { manifestTx: trimmed } };
    }

    if (!isRecord(value)) {
      throw new Error("PIP payload must be a JSON object or manifest txid");
    }

    const manifestTx = ensureManifestTx(value.manifestTx);
    const pip: PipDocument = {
      ...value,
      manifestTx,
    };

    if (pip.tenant != null && typeof pip.tenant !== "string") {
      throw new Error("PIP tenant must be a string");
    }

    if (pip.site != null && typeof pip.site !== "string") {
      throw new Error("PIP site must be a string");
    }

    return { ok: true, pip };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unable to validate PIP payload",
    };
  }
}

export function normalizePipInput(raw: string): PipValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: "PIP input is empty" };
  }

  return validatePipDocument(trimmed);
}
