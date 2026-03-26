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

export type VaultAuditStatus = "ok" | "error";

export type VaultAuditAction =
  | "describe"
  | "list"
  | "read"
  | "readRecord"
  | "write"
  | "deleteRecord"
  | "clear"
  | "enablePassword"
  | "disablePassword"
  | "export"
  | "import"
  | "backup";

export interface VaultAuditEvent {
  at: string;
  action: VaultAuditAction;
  status: VaultAuditStatus;
  detail?: string;
  manifestTx?: string;
  recordId?: string;
  tenant?: string;
  site?: string;
  mode?: VaultKeyMode;
  recordCount?: number;
  path?: string;
  filename?: string;
}

export type VaultIntegrityIssue = {
  id: string;
  error: string;
};

export type VaultKeyMode = "safeStorage" | "plain" | "password";

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

interface KeyEnvelopeV1 {
  mode: "safeStorage" | "plain";
  value: string;
}

interface KeyEnvelopeV2 {
  version: 2;
  mode: VaultKeyMode;
  value?: string;
  kdf?: {
    salt: string;
    iterations: number;
    digest: "sha256";
  };
}

type AnyKeyEnvelope = KeyEnvelopeV1 | KeyEnvelopeV2;

interface VaultBackupBundle {
  format: "pip-vault-bundle";
  version: 1;
  createdAt: string;
  mode: VaultKeyMode;
  key: KeyEnvelopeV2;
  vault: VaultStoreV2;
}

const VAULT_FILENAME = "pip-vault.json";
const KEY_FILENAME = "pip-vault.key.json";
const BACKUP_DIRNAME = "pip-vault-backups";
const KEY_SIZE = 32;
const KDF_ITERATIONS = 100_000;
const KDF_DIGEST = "sha256";
const KDF_SALT_BYTES = 16;

const vaultPath = () => path.join(app.getPath("userData"), VAULT_FILENAME);
const keyPath = () => path.join(app.getPath("userData"), KEY_FILENAME);
const backupDirPath = () => path.join(app.getPath("userData"), BACKUP_DIRNAME);

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
const sha256 = (value: string | Buffer): string => crypto.createHash("sha256").update(value).digest("hex");
const auditEvent = (action: VaultAuditAction, status: VaultAuditStatus, meta: Partial<VaultAuditEvent> = {}): VaultAuditEvent => ({
  at: nowIso(),
  action,
  status,
  ...meta,
});

const ensureBackupDir = async (): Promise<void> => {
  await fs.mkdir(backupDirPath(), { recursive: true });
};

const writeBackupFile = async (bundle: string): Promise<{ path: string; filename: string; savedAt: string }> => {
  await ensureBackupDir();
  const savedAt = nowIso();
  const filename = `pip-vault-backup-${savedAt.replace(/[:.]/g, "-")}.json`;
  const targetPath = path.join(backupDirPath(), filename);
  await fs.writeFile(targetPath, bundle, "utf-8");
  return { path: targetPath, filename, savedAt };
};

const buildRecordKey = (pip: PipDocument): string =>
  [normalizeText(pip.tenant).toLowerCase(), normalizeText(pip.site).toLowerCase(), normalizeText(pip.manifestTx).toLowerCase()]
    .join("|");

let cachedMasterKey: Buffer | null = null;
let cachedEnvelope: KeyEnvelopeV2 | null = null;

const normalizeKeyEnvelope = (raw: AnyKeyEnvelope | null): KeyEnvelopeV2 | null => {
  if (!raw) return null;

  if ("version" in raw && raw.version === 2) {
    return raw as KeyEnvelopeV2;
  }

  if ("mode" in raw && "value" in raw) {
    const legacy = raw as KeyEnvelopeV1;
    return { version: 2, mode: legacy.mode, value: legacy.value } as KeyEnvelopeV2;
  }

  return null;
};

const normalizeLegacyEnvelope = (envelope: LegacyVaultEnvelope): VaultEnvelope => ({
  id: "legacy",
  createdAt: envelope.updatedAt,
  updatedAt: envelope.updatedAt,
  iv: envelope.iv,
  authTag: envelope.authTag,
  payload: envelope.payload,
});

const normalizeVaultStore = (loaded: VaultStoreV2 | LegacyVaultEnvelope | null): VaultStoreV2 => {
  if (!loaded) return { version: 2, records: [] };
  if ("version" in loaded && loaded.version === 2) {
    return { version: 2, records: loaded.records ?? [] };
  }

  return { version: 2, records: [normalizeLegacyEnvelope(loaded as LegacyVaultEnvelope)] };
};

const derivePasswordKey = (password: string, salt: Buffer, iterations: number): Buffer =>
  crypto.pbkdf2Sync(password, salt, iterations, KEY_SIZE, KDF_DIGEST);

const cacheMasterKey = (key: Buffer, envelope: KeyEnvelopeV2) => {
  cachedMasterKey = key;
  cachedEnvelope = envelope;
};

const loadMasterKeyFromEnvelope = async (envelope: KeyEnvelopeV2, password?: string): Promise<Buffer> => {
  if (envelope.mode === "safeStorage") {
    if (!envelope.value) {
      throw new Error("Vault key payload missing for safeStorage mode");
    }
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("System encryption is unavailable for the PIP vault");
    }

    const plain = safeStorage.decryptString(decode(envelope.value));
    return decode(plain);
  }

  if (envelope.mode === "plain") {
    if (!envelope.value) {
      throw new Error("Vault key payload missing for plain mode");
    }

    return decode(envelope.value);
  }

  if (envelope.mode === "password") {
    if (!envelope.kdf?.salt) {
      throw new Error("Vault key metadata is missing the KDF salt");
    }

    if (!password || !password.trim()) {
      throw new Error("Vault password required");
    }

    const salt = decode(envelope.kdf.salt);
    const iterations = envelope.kdf.iterations ?? KDF_ITERATIONS;
    return derivePasswordKey(password, salt, iterations);
  }

  throw new Error(`Unsupported vault key mode: ${String((envelope as KeyEnvelopeV2).mode)}`);
};

const ensureKeyEnvelope = async (): Promise<KeyEnvelopeV2> => {
  const existingRaw = await readJsonFile<AnyKeyEnvelope>(keyPath());
  const normalized = normalizeKeyEnvelope(existingRaw);
  if (normalized) return normalized;

  const masterKey = crypto.randomBytes(KEY_SIZE);
  const envelope: KeyEnvelopeV2 = safeStorage.isEncryptionAvailable()
    ? {
        version: 2,
        mode: "safeStorage",
        value: encode(safeStorage.encryptString(encode(masterKey))),
      }
    : {
        version: 2,
        mode: "plain",
        value: encode(masterKey),
      };

  await writeJsonFile(keyPath(), envelope);
  cacheMasterKey(masterKey, envelope);
  return envelope;
};

async function loadMasterKey(password?: string): Promise<{ key: Buffer; envelope: KeyEnvelopeV2 }> {
  if (cachedMasterKey && cachedEnvelope) {
    return { key: cachedMasterKey, envelope: cachedEnvelope };
  }

  const envelope = await ensureKeyEnvelope();
  const key = await loadMasterKeyFromEnvelope(envelope, password);
  cacheMasterKey(key, envelope);
  return { key, envelope };
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

const readVaultStore = async (): Promise<VaultStoreV2 | LegacyVaultEnvelope | null> => {
  return readJsonFile<VaultStoreV2 | LegacyVaultEnvelope>(vaultPath());
};

const writeVaultStore = async (store: VaultStoreV2): Promise<void> => {
  await writeJsonFile(vaultPath(), store);
};

const listRecordEntries = async (masterKeyOverride?: Buffer): Promise<{ store: VaultStoreV2; records: Array<VaultEnvelope & { pip: PipDocument }> }> => {
  const store = normalizeVaultStore(await readVaultStore());

  if (!store.records.length) {
    return { store, records: [] };
  }

  const { key: masterKey } = masterKeyOverride ? { key: masterKeyOverride } : await loadMasterKey();

  const records = store.records
    .map((record) => ({
      ...record,
      pip: decrypt(masterKey, record),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return { store, records };
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

export async function readPipVault(password?: string): Promise<{ exists: boolean; updatedAt?: string; pip?: PipDocument }> {
  const { key } = await loadMasterKey(password);
  const { records } = await listRecordEntries(key);
  const latest = records[0];

  if (!latest) {
    return { exists: false };
  }

  return { exists: true, updatedAt: latest.updatedAt, pip: latest.pip };
}

export async function readPipVaultRecord(id: string, password?: string): Promise<{ exists: boolean; updatedAt?: string; pip?: PipDocument }> {
  const { key } = await loadMasterKey(password);
  const { records } = await listRecordEntries(key);
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

  const { key: masterKey } = await loadMasterKey();
  const loaded = await readVaultStore();
  const existingRecords = normalizeVaultStore(loaded).records;
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

  const { key: masterKey } = await loadMasterKey();
  const existingRecords = normalizeVaultStore(loaded).records;
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
  mode: VaultKeyMode;
  iterations?: number;
  salt?: string;
  locked: boolean;
  recordCount: number;
}> {
  const envelope = normalizeKeyEnvelope(await readJsonFile<AnyKeyEnvelope>(keyPath()));
  const store = normalizeVaultStore(await readVaultStore());
  const latest = store.records.reduce<string | undefined>((latestUpdated, record) => {
    if (!latestUpdated) return record.updatedAt;
    return record.updatedAt > latestUpdated ? record.updatedAt : latestUpdated;
  }, undefined);

  const mode: VaultKeyMode = envelope?.mode ?? (safeStorage.isEncryptionAvailable() ? "safeStorage" : "plain");
  const locked = mode === "password" && !cachedMasterKey;

  return {
    exists: store.records.length > 0,
    updatedAt: latest,
    encrypted: true,
    path: vaultPath(),
    mode,
    iterations: envelope?.kdf?.iterations,
    salt: envelope?.kdf?.salt,
    locked,
    recordCount: store.records.length,
  };
}

export async function enableVaultPassword(password: string): Promise<{ ok: true; mode: VaultKeyMode; iterations: number; salt: string; records: number }> {
  const trimmed = (password ?? "").trim();
  if (!trimmed) {
    throw new Error("Password is required to enable password mode");
  }

  const currentEnvelope = await ensureKeyEnvelope();
  const store = normalizeVaultStore(await readVaultStore());

  // If already password protected, either unlock (when locked) or rotate to the new password (when unlocked).
  if (currentEnvelope.mode === "password") {
    const hasUnlockedKey = Boolean(cachedMasterKey);
    const currentMasterKey = hasUnlockedKey
      ? (cachedMasterKey as Buffer)
      : await loadMasterKeyFromEnvelope(currentEnvelope, trimmed);

    if (!hasUnlockedKey) {
      if (store.records.length) {
        // Validate password correctness against the first record without mutating disk.
        try {
          decrypt(currentMasterKey, store.records[0]);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Invalid vault password";
          throw new Error(message === "Unsupported state or unable to authenticate data" ? "Invalid vault password" : message);
        }
      }

      cacheMasterKey(currentMasterKey, currentEnvelope);

      return {
        ok: true,
        mode: currentEnvelope.mode,
        iterations: currentEnvelope.kdf?.iterations ?? KDF_ITERATIONS,
        salt: currentEnvelope.kdf?.salt ?? "",
        records: store.records.length,
      };
    }

    // Rotate: re-encrypt vault with the new password while the current master key is in memory.
    const salt = crypto.randomBytes(KDF_SALT_BYTES);
    const derivedKey = derivePasswordKey(trimmed, salt, KDF_ITERATIONS);

    const rewrappedRecords = store.records.map((record) => {
      const pip = decrypt(currentMasterKey, record);
      return encrypt(derivedKey, record.id, pip, record.createdAt, record.updatedAt);
    });

    const nextEnvelope: KeyEnvelopeV2 = {
      version: 2,
      mode: "password",
      kdf: {
        salt: encode(salt),
        iterations: KDF_ITERATIONS,
        digest: KDF_DIGEST,
      },
    };

    await writeVaultStore({ version: 2, records: rewrappedRecords });
    await writeJsonFile(keyPath(), nextEnvelope);
    cacheMasterKey(derivedKey, nextEnvelope);

    return {
      ok: true,
      mode: nextEnvelope.mode,
      iterations: nextEnvelope.kdf!.iterations,
      salt: nextEnvelope.kdf!.salt,
      records: rewrappedRecords.length,
    };
  }

  const { key: currentMasterKey } = await loadMasterKey();
  const salt = crypto.randomBytes(KDF_SALT_BYTES);
  const derivedKey = derivePasswordKey(trimmed, salt, KDF_ITERATIONS);

  const reencryptedRecords = store.records.map((record) => {
    const pip = decrypt(currentMasterKey, record);
    return encrypt(derivedKey, record.id, pip, record.createdAt, record.updatedAt);
  });

  const nextEnvelope: KeyEnvelopeV2 = {
    version: 2,
    mode: "password",
    kdf: {
      salt: encode(salt),
      iterations: KDF_ITERATIONS,
      digest: KDF_DIGEST,
    },
  };

  await writeVaultStore({ version: 2, records: reencryptedRecords });
  await writeJsonFile(keyPath(), nextEnvelope);
  cacheMasterKey(derivedKey, nextEnvelope);

  const kdf = nextEnvelope.kdf!;

  return {
    ok: true,
    mode: nextEnvelope.mode,
    iterations: kdf.iterations,
    salt: kdf.salt,
    records: reencryptedRecords.length,
  };
}

export async function disableVaultPassword(): Promise<{ ok: true; mode: VaultKeyMode }> {
  const { key: masterKey } = await loadMasterKey();

  const envelope: KeyEnvelopeV2 = safeStorage.isEncryptionAvailable()
    ? {
        version: 2,
        mode: "safeStorage",
        value: encode(safeStorage.encryptString(encode(masterKey))),
      }
    : {
        version: 2,
        mode: "plain",
        value: encode(masterKey),
      };

  await writeJsonFile(keyPath(), envelope);
  cacheMasterKey(masterKey, envelope);

  return { ok: true, mode: envelope.mode };
}

export async function exportPipVault(): Promise<{
  ok: true;
  bundle: string;
  checksum: string;
  bytes: number;
  createdAt: string;
  recordCount: number;
}> {
  const envelope = await ensureKeyEnvelope();
  const store = normalizeVaultStore(await readVaultStore());
  const createdAt = nowIso();

  const bundle: VaultBackupBundle = {
    format: "pip-vault-bundle",
    version: 1,
    createdAt,
    mode: envelope.mode,
    key: envelope,
    vault: store,
  };

  const serialized = JSON.stringify(bundle, null, 2);
  const checksum = sha256(serialized);
  const bytes = Buffer.byteLength(serialized, "utf-8");

  return { ok: true, bundle: serialized, checksum, bytes, createdAt, recordCount: store.records.length };
}

const parseBundleInput = (bundleInput: unknown): VaultBackupBundle => {
  if (bundleInput == null) {
    throw new Error("No vault bundle provided");
  }

  let text: string;
  if (typeof bundleInput === "string") {
    text = bundleInput;
  } else if (Buffer.isBuffer(bundleInput)) {
    text = bundleInput.toString("utf-8");
  } else if (bundleInput instanceof ArrayBuffer) {
    text = Buffer.from(bundleInput).toString("utf-8");
  } else if (bundleInput instanceof Uint8Array) {
    text = Buffer.from(bundleInput).toString("utf-8");
  } else {
    throw new Error("Unsupported vault bundle type; expected string or Buffer");
  }

  const parsed = JSON.parse(text) as VaultBackupBundle;
  if (!parsed || parsed.format !== "pip-vault-bundle" || parsed.version !== 1) {
    throw new Error("Invalid vault bundle format");
  }

  return parsed;
};

export async function importPipVault(bundleInput: unknown, password?: string): Promise<{ ok: true; mode: VaultKeyMode; records: number }> {
  const bundle = parseBundleInput(bundleInput);
  const envelope = normalizeKeyEnvelope(bundle.key);

  if (!envelope) {
    throw new Error("Vault bundle is missing key metadata");
  }

  const store = normalizeVaultStore(bundle.vault);
  const masterKey = await loadMasterKeyFromEnvelope(envelope, envelope.mode === "password" ? password : undefined);

  if (store.records.length) {
    // Validate we can decrypt with the supplied credentials before touching disk.
    try {
      decrypt(masterKey, store.records[0]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid vault password";
      throw new Error(message === "Unsupported state or unable to authenticate data" ? "Invalid vault password" : message);
    }
  }

  await writeVaultStore(store);
  await writeJsonFile(keyPath(), envelope);
  cacheMasterKey(masterKey, envelope);

  return { ok: true, mode: envelope.mode, records: store.records.length };
}

export async function scanVaultIntegrity(password?: string): Promise<{
  ok: true;
  scanned: number;
  failed: VaultIntegrityIssue[];
  durationMs: number;
  recordCount: number;
}> {
  const started = Date.now();
  const store = normalizeVaultStore(await readVaultStore());
  if (!store.records.length) {
    return { ok: true, scanned: 0, failed: [], durationMs: Date.now() - started, recordCount: 0 };
  }

  const { key: masterKey } = await loadMasterKey(password);
  const failed: VaultIntegrityIssue[] = [];

  for (const record of store.records) {
    try {
      decrypt(masterKey, record);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Decryption failed";
      failed.push({
        id: record.id,
        error: message === "Unsupported state or unable to authenticate data" ? "Authentication failed" : message,
      });
    }
  }

  return {
    ok: true,
    scanned: store.records.length,
    failed,
    durationMs: Date.now() - started,
    recordCount: store.records.length,
  };
}
