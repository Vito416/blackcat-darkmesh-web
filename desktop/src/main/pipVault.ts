import { app, safeStorage } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

export interface PipDocument {
  tenant?: string;
  site?: string;
  manifestTx: string;
  [key: string]: unknown;
}

export interface PipVaultRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  manifestTx: string;
  tenant?: string;
  site?: string;
}

interface VaultEnvelope {
  id: string;
  createdAt: string;
  updatedAt: string;
  iv: string;
  authTag: string;
  payload: string;
}

interface VaultStoreV2 {
  version: 2;
  records: VaultEnvelope[];
}

interface LegacyVaultEnvelope {
  version?: 1;
  updatedAt: string;
  iv: string;
  authTag: string;
  payload: string;
}

interface KeyEnvelope {
  mode: "safeStorage" | "plain";
  value: string;
}

const VAULT_FILENAME = "pip-vault.json";
const KEY_FILENAME = "pip-vault.key.json";
const KEY_SIZE = 32;

const vaultPath = () => path.join(app.getPath("userData"), VAULT_FILENAME);
const keyPath = () => path.join(app.getPath("userData"), KEY_FILENAME);

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return null;
    }
    throw err;
  }
};

const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
};

const deleteFileIfExists = async (filePath: string): Promise<void> => {
  try {
    await fs.unlink(filePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") {
      throw err;
    }
  }
};

const encode = (buffer: Buffer): string => buffer.toString("base64");
const decode = (value: string): Buffer => Buffer.from(value, "base64");
const nowIso = () => new Date().toISOString();
const normalizeText = (value?: string): string => (typeof value === "string" ? value.trim() : "");

const buildRecordKey = (pip: PipDocument): string =>
  [normalizeText(pip.tenant).toLowerCase(), normalizeText(pip.site).toLowerCase(), normalizeText(pip.manifestTx).toLowerCase()]
    .join("|");

async function loadMasterKey(): Promise<Buffer> {
  const existing = await readJsonFile<KeyEnvelope>(keyPath());
  if (existing) {
    if (existing.mode === "safeStorage") {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error("System encryption is unavailable for the PIP vault");
      }

      const plain = safeStorage.decryptString(decode(existing.value));
      return decode(plain);
    }

    return decode(existing.value);
  }

  const masterKey = crypto.randomBytes(KEY_SIZE);
  const envelope: KeyEnvelope = safeStorage.isEncryptionAvailable()
    ? {
        mode: "safeStorage",
        value: encode(safeStorage.encryptString(encode(masterKey))),
      }
    : {
        mode: "plain",
        value: encode(masterKey),
      };

  await writeJsonFile(keyPath(), envelope);
  return masterKey;
}

const encrypt = (masterKey: Buffer, id: string, pip: PipDocument, createdAt: string, updatedAt: string): VaultEnvelope => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey, iv);
  const payload = JSON.stringify(pip);
  const ciphertext = Buffer.concat([cipher.update(payload, "utf-8"), cipher.final()]);

  return {
    id,
    createdAt,
    updatedAt,
    iv: encode(iv),
    authTag: encode(cipher.getAuthTag()),
    payload: encode(ciphertext),
  };
};

const decrypt = (masterKey: Buffer, envelope: VaultEnvelope | LegacyVaultEnvelope): PipDocument => {
  const decipher = crypto.createDecipheriv("aes-256-gcm", masterKey, decode(envelope.iv));
  decipher.setAuthTag(decode(envelope.authTag));
  const plain = Buffer.concat([decipher.update(decode(envelope.payload)), decipher.final()]).toString("utf-8");
  const parsed = JSON.parse(plain) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("PIP vault payload is malformed");
  }

  const pip = parsed as PipDocument;
  if (typeof pip.manifestTx !== "string" || !pip.manifestTx.trim()) {
    throw new Error("PIP vault payload is missing manifestTx");
  }

  return pip;
};

const normalizeLegacyEnvelope = (envelope: LegacyVaultEnvelope): VaultEnvelope => ({
  id: "legacy",
  createdAt: envelope.updatedAt,
  updatedAt: envelope.updatedAt,
  iv: envelope.iv,
  authTag: envelope.authTag,
  payload: envelope.payload,
});

const readVaultStore = async (): Promise<VaultStoreV2 | LegacyVaultEnvelope | null> => {
  return readJsonFile<VaultStoreV2 | LegacyVaultEnvelope>(vaultPath());
};

const writeVaultStore = async (store: VaultStoreV2): Promise<void> => {
  await writeJsonFile(vaultPath(), store);
};

const listRecordEntries = async (): Promise<{ store: VaultStoreV2; records: Array<VaultEnvelope & { pip: PipDocument }> }> => {
  const loaded = await readVaultStore();

  if (!loaded) {
    return { store: { version: 2, records: [] }, records: [] };
  }

  const masterKey = await loadMasterKey();
  const rawRecords = "version" in loaded && loaded.version === 2 ? loaded.records : [normalizeLegacyEnvelope(loaded)];
  const records = rawRecords
    .map((record) => ({
      ...record,
      pip: decrypt(masterKey, record),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return {
    store: { version: 2, records: rawRecords },
    records,
  };
};

const toMeta = (record: VaultEnvelope & { pip: PipDocument }): PipVaultRecord => ({
  id: record.id,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  manifestTx: record.pip.manifestTx,
  tenant: record.pip.tenant,
  site: record.pip.site,
});

export async function listPipVaultRecords(): Promise<{ exists: boolean; records: PipVaultRecord[] }> {
  const loaded = await readVaultStore();
  if (!loaded) {
    return { exists: false, records: [] };
  }

  const { records } = await listRecordEntries();
  return { exists: records.length > 0, records: records.map(toMeta) };
}

export async function readPipVault(): Promise<{ exists: boolean; updatedAt?: string; pip?: PipDocument }> {
  const { records } = await listRecordEntries();
  const latest = records[0];

  if (!latest) {
    return { exists: false };
  }

  return { exists: true, updatedAt: latest.updatedAt, pip: latest.pip };
}

export async function readPipVaultRecord(id: string): Promise<{ exists: boolean; updatedAt?: string; pip?: PipDocument }> {
  const { records } = await listRecordEntries();
  const record = records.find((entry) => entry.id === id);

  if (!record) {
    return { exists: false };
  }

  return { exists: true, updatedAt: record.updatedAt, pip: record.pip };
}

export async function writePipVault(pip: PipDocument): Promise<{ updatedAt: string; recordId: string; createdAt: string }> {
  if (!pip || typeof pip !== "object") {
    throw new Error("PIP vault requires a manifest payload");
  }

  if (typeof pip.manifestTx !== "string" || !pip.manifestTx.trim()) {
    throw new Error("PIP vault requires a manifestTx");
  }

  const masterKey = await loadMasterKey();
  const loaded = await readVaultStore();
  const existingRecords = "version" in (loaded ?? {}) && loaded?.version === 2 ? loaded.records : loaded ? [normalizeLegacyEnvelope(loaded as LegacyVaultEnvelope)] : [];
  const now = nowIso();
  const key = buildRecordKey(pip);
  const decrypted = await Promise.all(existingRecords.map(async (record) => ({ record, pip: decrypt(masterKey, record) })));
  const matchIndex = decrypted.findIndex(({ pip: candidate }) => buildRecordKey(candidate) === key);

  let nextRecords: VaultEnvelope[];
  let resultRecord: VaultEnvelope;

  if (matchIndex >= 0) {
    const current = existingRecords[matchIndex];
    resultRecord = encrypt(masterKey, current.id, pip, current.createdAt, now);
    nextRecords = existingRecords.map((record, index) => (index === matchIndex ? resultRecord : record));
  } else {
    const recordId = crypto.randomUUID();
    resultRecord = encrypt(masterKey, recordId, pip, now, now);
    nextRecords = [resultRecord, ...existingRecords];
  }

  await writeVaultStore({ version: 2, records: nextRecords });
  return { updatedAt: resultRecord.updatedAt, recordId: resultRecord.id, createdAt: resultRecord.createdAt };
}

export async function deletePipVaultRecord(id: string): Promise<{ ok: true; removed: boolean }> {
  const loaded = await readVaultStore();
  if (!loaded) {
    return { ok: true, removed: false };
  }

  const masterKey = await loadMasterKey();
  const existingRecords = "version" in loaded && loaded.version === 2 ? loaded.records : [normalizeLegacyEnvelope(loaded)];
  const decrypted = await Promise.all(existingRecords.map(async (record) => ({ record, pip: decrypt(masterKey, record) })));
  const nextRecords = decrypted.filter(({ record }) => record.id !== id).map(({ record }) => record);
  const removed = nextRecords.length !== existingRecords.length;

  if (!removed) {
    return { ok: true, removed: false };
  }

  if (nextRecords.length === 0) {
    await deleteFileIfExists(vaultPath());
    return { ok: true, removed: true };
  }

  await writeVaultStore({ version: 2, records: nextRecords });
  return { ok: true, removed: true };
}

export async function clearPipVault(): Promise<void> {
  await deleteFileIfExists(vaultPath());
}

export async function describePipVault(): Promise<{
  exists: boolean;
  updatedAt?: string;
  encrypted: boolean;
  path: string;
}> {
  const { records } = await listRecordEntries();
  const latest = records[0];
  return {
    exists: records.length > 0,
    updatedAt: latest?.updatedAt,
    encrypted: true,
    path: vaultPath(),
  };
}
