import { app, safeStorage } from "electron";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { Algorithm, Version, hashRaw } from "@node-rs/argon2";

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

export type VaultTelemetryEvent = {
  event: string;
  at?: string;
  detail?: Record<string, unknown>;
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

interface KeyEnvelopeV3 {
  version: 3;
  mode: VaultKeyMode;
  value?: string;
  kdf?: KdfMeta;
  hardwarePlaceholder?: boolean;
}

type AnyKeyEnvelope = KeyEnvelopeV1 | KeyEnvelopeV2 | KeyEnvelopeV3;

interface VaultBackupBundle {
  format: "pip-vault-bundle";
  version: 1;
  createdAt: string;
  mode: VaultKeyMode;
  key: KeyEnvelopeV3;
  vault: VaultStoreV2;
}

const VAULT_FILENAME = "pip-vault.json";
const KEY_FILENAME = "pip-vault.key.json";
const BACKUP_DIRNAME = "pip-vault-backups";
const REPAIR_DIRNAME = "pip-vault-repair";
const KEY_SIZE = 32;
const KDF_ITERATIONS = 100_000;
const KDF_DIGEST = "sha256";
const KDF_SALT_BYTES = 16;
const ARGON2_TIME_COST = 3;
const ARGON2_MEMORY_KIB = 64 * 1024;
const ARGON2_PARALLELISM = 1;
const ARGON2_VERSION = Version.V0x13;
type Pbkdf2KdfMeta = {
  algorithm: "pbkdf2";
  iterations: number;
  salt: string;
  digest: typeof KDF_DIGEST;
  version: number;
};
type Argon2KdfMeta = {
  algorithm: "argon2id";
  iterations: number;
  salt: string;
  memoryKiB: number;
  parallelism: number;
  version: number;
};
type KdfMeta = Pbkdf2KdfMeta | Argon2KdfMeta;

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

export function recordVaultTelemetry(event: VaultTelemetryEvent): { ok: true } {
  const payload = { ...event, at: event.at ?? nowIso() };
  try {
    // eslint-disable-next-line no-console
    console.info("[vault:telemetry]", payload);
  } catch {
    // ignore telemetry logging failures
  }
  return { ok: true };
}

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

const ensureRepairDir = async (): Promise<void> => {
  await fs.mkdir(repairDirPath(), { recursive: true });
};

const writeRepairFile = async (
  record: VaultEnvelope,
  envelope: KeyEnvelopeV3,
  pipMeta?: Partial<PipDocument> | null,
): Promise<{ path: string; filename: string; savedAt: string }> => {
  await ensureRepairDir();
  const savedAt = nowIso();
  const filename = `pip-vault-repair-${record.id}-${savedAt.replace(/[:.]/g, "-")}.json`;
  const targetPath = path.join(repairDirPath(), filename);
  const sanitizedEnvelope: Partial<KeyEnvelopeV3> = {
    version: envelope.version,
    mode: envelope.mode,
    kdf: envelope.kdf,
    hardwarePlaceholder: envelope.hardwarePlaceholder,
  };
  const payload = {
    format: "pip-vault-repair",
    savedAt,
    recordId: record.id,
    envelope: sanitizedEnvelope,
    record,
    pip: pipMeta ? { manifestTx: pipMeta.manifestTx, tenant: pipMeta.tenant, site: pipMeta.site } : null,
  };
  await fs.writeFile(targetPath, JSON.stringify(payload, null, 2), "utf-8");
  return { path: targetPath, filename, savedAt };
};

const buildRecordKey = (pip: PipDocument): string =>
  [normalizeText(pip.tenant).toLowerCase(), normalizeText(pip.site).toLowerCase(), normalizeText(pip.manifestTx).toLowerCase()]
    .join("|");

let cachedMasterKey: Buffer | null = null;
let cachedEnvelope: KeyEnvelopeV3 | null = null;
let lastLockAt: string | null = null;

const repairDirPath = () => path.join(app.getPath("userData"), REPAIR_DIRNAME);

const ensurePbkdfMeta = (meta?: Partial<Pbkdf2KdfMeta> | null): Pbkdf2KdfMeta => {
  const salt = meta?.salt ?? encode(crypto.randomBytes(KDF_SALT_BYTES));
  if (!salt) {
    throw new Error("Vault key metadata is missing the KDF salt");
  }

  return {
    algorithm: "pbkdf2",
    iterations: meta?.iterations ?? KDF_ITERATIONS,
    salt,
    digest: meta?.digest ?? KDF_DIGEST,
    version: meta?.version ?? 1,
  };
};

const ensureArgon2Meta = (meta?: Partial<Argon2KdfMeta> | null): Argon2KdfMeta => {
  const salt = meta?.salt ?? encode(crypto.randomBytes(KDF_SALT_BYTES));
  if (!salt) {
    throw new Error("Vault key metadata is missing the KDF salt");
  }

  return {
    algorithm: "argon2id",
    iterations: meta?.iterations ?? ARGON2_TIME_COST,
    salt,
    memoryKiB: meta?.memoryKiB ?? ARGON2_MEMORY_KIB,
    parallelism: meta?.parallelism ?? ARGON2_PARALLELISM,
    version: meta?.version ?? ARGON2_VERSION,
  };
};

const normalizeKdfMeta = (meta?: KdfMeta | KeyEnvelopeV2["kdf"] | null): KdfMeta | undefined => {
  if (!meta) return undefined;
  if ((meta as KdfMeta).algorithm === "argon2id") {
    return ensureArgon2Meta(meta as Partial<Argon2KdfMeta>);
  }
  if ((meta as KdfMeta).algorithm === "pbkdf2") {
    return ensurePbkdfMeta(meta as Partial<Pbkdf2KdfMeta>);
  }
  return ensurePbkdfMeta(meta as Partial<Pbkdf2KdfMeta>);
};

const normalizeKeyEnvelope = (raw: AnyKeyEnvelope | null): KeyEnvelopeV3 | null => {
  if (!raw) return null;

  if ("version" in raw && raw.version === 3) {
    const env = raw as KeyEnvelopeV3;
    return {
      ...env,
      kdf: env.mode === "password" ? normalizeKdfMeta(env.kdf) ?? ensurePbkdfMeta() : normalizeKdfMeta(env.kdf),
    };
  }

  if ("version" in raw && raw.version === 2) {
    const env2 = raw as KeyEnvelopeV2;
    return {
      version: 3,
      mode: env2.mode,
      value: env2.value,
      kdf: env2.mode === "password" ? normalizeKdfMeta(env2.kdf) ?? ensurePbkdfMeta(env2.kdf) : normalizeKdfMeta(env2.kdf),
      hardwarePlaceholder: false,
    };
  }

  if ("mode" in raw && "value" in raw) {
    const legacy = raw as KeyEnvelopeV1;
    return { version: 3, mode: legacy.mode, value: legacy.value, hardwarePlaceholder: false };
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

const derivePasswordKey = async (password: string, kdf: KdfMeta): Promise<Buffer> => {
  if (kdf.algorithm === "argon2id") {
    const result = await hashRaw(password, {
      salt: decode(kdf.salt),
      memoryCost: kdf.memoryKiB,
      timeCost: kdf.iterations,
      parallelism: kdf.parallelism ?? ARGON2_PARALLELISM,
      outputLen: KEY_SIZE,
      algorithm: Algorithm.Argon2id,
      version: kdf.version ?? ARGON2_VERSION,
    });
    return Buffer.from(result);
  }

  return crypto.pbkdf2Sync(password, decode(kdf.salt), kdf.iterations, KEY_SIZE, kdf.digest);
};

const cacheMasterKey = (key: Buffer, envelope: KeyEnvelopeV3) => {
  cachedMasterKey = key;
  cachedEnvelope = envelope;
  lastLockAt = null;
};

const loadMasterKeyFromEnvelope = async (envelope: KeyEnvelopeV3, password?: string): Promise<Buffer> => {
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
    if (!envelope.kdf) {
      throw new Error("Vault key metadata is missing the KDF parameters");
    }
    const kdf = normalizeKdfMeta(envelope.kdf) as KdfMeta;
    if (!kdf?.salt) {
      throw new Error("Vault key metadata is missing the KDF salt");
    }

    if (!password || !password.trim()) {
      throw new Error("Vault password required");
    }

    return derivePasswordKey(password, kdf);
  }

  throw new Error(`Unsupported vault key mode: ${String((envelope as KeyEnvelopeV3).mode)}`);
};

const ensureKeyEnvelope = async (): Promise<KeyEnvelopeV3> => {
  const existingRaw = await readJsonFile<AnyKeyEnvelope>(keyPath());
  const normalized = normalizeKeyEnvelope(existingRaw);
  if (normalized) return normalized;

  const masterKey = crypto.randomBytes(KEY_SIZE);
  const envelope: KeyEnvelopeV3 = safeStorage.isEncryptionAvailable()
    ? {
        version: 3,
        mode: "safeStorage",
        value: encode(safeStorage.encryptString(encode(masterKey))),
        hardwarePlaceholder: false,
      }
    : {
        version: 3,
        mode: "plain",
        value: encode(masterKey),
        hardwarePlaceholder: false,
      };

  await writeJsonFile(keyPath(), envelope);
  cacheMasterKey(masterKey, envelope);
  return envelope;
};

async function loadMasterKey(password?: string): Promise<{ key: Buffer; envelope: KeyEnvelopeV3 }> {
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
  lockedAt?: string;
  recordCount: number;
  kdf: KdfMeta;
  hardwarePlaceholder?: boolean;
}> {
  const envelope = normalizeKeyEnvelope(await readJsonFile<AnyKeyEnvelope>(keyPath()));
  const store = normalizeVaultStore(await readVaultStore());
  const latest = store.records.reduce<string | undefined>((latestUpdated, record) => {
    if (!latestUpdated) return record.updatedAt;
    return record.updatedAt > latestUpdated ? record.updatedAt : latestUpdated;
  }, undefined);

  const mode: VaultKeyMode = envelope?.mode ?? (safeStorage.isEncryptionAvailable() ? "safeStorage" : "plain");
  const locked = mode === "password" && !cachedMasterKey;
  const kdf: KdfMeta = envelope?.kdf ?? ensurePbkdfMeta();

  return {
    exists: store.records.length > 0,
    updatedAt: latest,
    encrypted: true,
    path: vaultPath(),
    mode,
    iterations: kdf.iterations,
    salt: kdf.salt,
    locked,
    lockedAt: locked ? lastLockAt ?? undefined : undefined,
    recordCount: store.records.length,
    kdf,
    hardwarePlaceholder: envelope?.hardwarePlaceholder ?? false,
  };
}

export async function enableVaultPassword(
  password: string,
  options?: { kdf?: Partial<KdfMeta>; hardwarePlaceholder?: boolean },
): Promise<{ ok: true; mode: VaultKeyMode; kdf: KdfMeta; records: number; hardwarePlaceholder?: boolean }> {
  const trimmed = (password ?? "").trim();
  if (!trimmed) {
    throw new Error("Password is required to enable password mode");
  }

  const currentEnvelope = await ensureKeyEnvelope();
  const store = normalizeVaultStore(await readVaultStore());
  const desiredHardwarePlaceholder = options?.hardwarePlaceholder ?? currentEnvelope.hardwarePlaceholder ?? false;

  const resolveKdf = (fallback?: KdfMeta): KdfMeta => {
    if (options?.kdf) {
      const meta = options.kdf;
      if ((meta as KdfMeta).algorithm === "argon2id") {
        return ensureArgon2Meta(meta as Partial<Argon2KdfMeta>);
      }
      return ensurePbkdfMeta(meta as Partial<Pbkdf2KdfMeta>);
    }
    if (fallback) return normalizeKdfMeta(fallback) ?? ensurePbkdfMeta();
    return ensurePbkdfMeta();
  };

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

      const unlockedEnvelope: KeyEnvelopeV3 = {
        ...currentEnvelope,
        hardwarePlaceholder: desiredHardwarePlaceholder,
        kdf: currentEnvelope.kdf ?? ensurePbkdfMeta(),
      };

      cacheMasterKey(currentMasterKey, unlockedEnvelope);
      await writeJsonFile(keyPath(), unlockedEnvelope);

      return {
        ok: true,
        mode: unlockedEnvelope.mode,
        kdf: unlockedEnvelope.kdf ?? ensurePbkdfMeta(),
        records: store.records.length,
        hardwarePlaceholder: unlockedEnvelope.hardwarePlaceholder,
      };
    }

    // Rotate: re-encrypt vault with the new password while the current master key is in memory.
    const nextKdf = resolveKdf(currentEnvelope.kdf ?? undefined);
    const derivedKey = await derivePasswordKey(trimmed, nextKdf);

    const rewrappedRecords = store.records.map((record) => {
      const pip = decrypt(currentMasterKey, record);
      return encrypt(derivedKey, record.id, pip, record.createdAt, record.updatedAt);
    });

    const nextEnvelope: KeyEnvelopeV3 = {
      version: 3,
      mode: "password",
      kdf: nextKdf,
      hardwarePlaceholder: desiredHardwarePlaceholder,
    };

    await writeVaultStore({ version: 2, records: rewrappedRecords });
    await writeJsonFile(keyPath(), nextEnvelope);
    cacheMasterKey(derivedKey, nextEnvelope);

    return {
      ok: true,
      mode: nextEnvelope.mode,
      records: rewrappedRecords.length,
      kdf: nextKdf,
      hardwarePlaceholder: desiredHardwarePlaceholder,
    };
  }

  const { key: currentMasterKey } = await loadMasterKey();
  const nextKdf = resolveKdf();
  const derivedKey = await derivePasswordKey(trimmed, nextKdf);

  const reencryptedRecords = store.records.map((record) => {
    const pip = decrypt(currentMasterKey, record);
    return encrypt(derivedKey, record.id, pip, record.createdAt, record.updatedAt);
  });

  const nextEnvelope: KeyEnvelopeV3 = {
    version: 3,
    mode: "password",
    kdf: nextKdf,
    hardwarePlaceholder: desiredHardwarePlaceholder,
  };

  await writeVaultStore({ version: 2, records: reencryptedRecords });
  await writeJsonFile(keyPath(), nextEnvelope);
  cacheMasterKey(derivedKey, nextEnvelope);

  return {
    ok: true,
    mode: nextEnvelope.mode,
    records: reencryptedRecords.length,
    kdf: nextKdf,
    hardwarePlaceholder: desiredHardwarePlaceholder,
  };
}

export async function disableVaultPassword(): Promise<{ ok: true; mode: VaultKeyMode }> {
  const { key: masterKey, envelope: currentEnvelope } = await loadMasterKey();
  const hardwarePlaceholder = currentEnvelope.hardwarePlaceholder ?? false;

  const envelope: KeyEnvelopeV3 = safeStorage.isEncryptionAvailable()
    ? {
        version: 3,
        mode: "safeStorage",
        value: encode(safeStorage.encryptString(encode(masterKey))),
        hardwarePlaceholder,
      }
    : {
        version: 3,
        mode: "plain",
        value: encode(masterKey),
        hardwarePlaceholder,
      };

  await writeJsonFile(keyPath(), envelope);
  cacheMasterKey(masterKey, envelope);

  return { ok: true, mode: envelope.mode };
}

export async function setHardwarePlaceholder(enabled: boolean): Promise<{ ok: true; hardwarePlaceholder: boolean }> {
  const envelope = await ensureKeyEnvelope();
  const nextEnvelope: KeyEnvelopeV3 = { ...envelope, hardwarePlaceholder: Boolean(enabled) };
  await writeJsonFile(keyPath(), nextEnvelope);
  if (cachedMasterKey) {
    cacheMasterKey(cachedMasterKey, nextEnvelope);
  } else {
    cachedEnvelope = nextEnvelope;
  }
  return { ok: true, hardwarePlaceholder: nextEnvelope.hardwarePlaceholder ?? false };
}

export function lockVault(): { ok: true; locked: boolean; lockedAt: string } {
  cachedMasterKey = null;
  const lockedAt = nowIso();
  lastLockAt = lockedAt;
  return { ok: true, locked: true, lockedAt };
}

export async function exportPipVault(): Promise<{
  ok: true;
  bundle: string;
  checksum: string;
  bytes: number;
  createdAt: string;
  recordCount: number;
  kdf: KdfMeta;
}> {
  const envelope = await ensureKeyEnvelope();
  const store = normalizeVaultStore(await readVaultStore());
  const createdAt = nowIso();
  const kdf: KdfMeta = envelope.kdf ?? ensurePbkdfMeta();

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

  return { ok: true, bundle: serialized, checksum, bytes, createdAt, recordCount: store.records.length, kdf };
}

export async function repairVaultRecord(
  id: string,
  options?: { strategy?: "rewrap" | "quarantine"; deleteAfter?: boolean; password?: string },
): Promise<{ ok: true; repaired: boolean; quarantinedPath?: string; removed?: boolean; message?: string } | { ok: false; error: string }> {
  const store = normalizeVaultStore(await readVaultStore());
  const target = store.records.find((record) => record.id === id);
  if (!target) {
    return { ok: false, error: "Record not found" };
  }

  const strategy = options?.strategy ?? "rewrap";
  const deleteAfter = options?.deleteAfter ?? false;
  const { key: masterKey, envelope } = await loadMasterKey(options?.password);

  let pip: PipDocument | null = null;
  try {
    pip = decrypt(masterKey, target);
  } catch (err) {
    if (strategy === "rewrap") {
      const message = err instanceof Error ? err.message : "Unable to decrypt vault record";
      return { ok: false, error: message === "Unsupported state or unable to authenticate data" ? "Authentication failed" : message };
    }
  }

  let nextRecords = store.records;
  let repaired = false;
  let removed = false;
  let quarantinedPath: string | undefined;

  const pipMeta = pip ? { manifestTx: pip.manifestTx, tenant: pip.tenant, site: pip.site } : null;

  if (strategy === "quarantine" || deleteAfter) {
    const repairFile = await writeRepairFile(target, envelope, pipMeta);
    quarantinedPath = repairFile.path;
  }

  if (strategy === "rewrap" && pip) {
    const healed = encrypt(masterKey, target.id, pip, target.createdAt, nowIso());
    nextRecords = store.records.map((record) => (record.id === id ? healed : record));
    repaired = true;
  }

  if (deleteAfter) {
    nextRecords = nextRecords.filter((record) => record.id !== id);
    removed = true;
  }

  if (repaired || removed) {
    if (nextRecords.length === 0) {
      await deleteFileIfExists(vaultPath());
    } else {
      await writeVaultStore({ version: 2, records: nextRecords });
    }
  }

  return {
    ok: true,
    repaired,
    quarantinedPath,
    removed,
    message:
      strategy === "quarantine"
        ? removed
          ? "Record quarantined and removed"
          : "Record quarantined"
        : repaired
          ? "Record re-wrapped with fresh authentication tag"
          : undefined,
  };
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

export async function importPipVault(
  bundleInput: unknown,
  password?: string,
): Promise<{ ok: true; mode: VaultKeyMode; records: number; kdf?: KdfMeta; hardwarePlaceholder?: boolean }> {
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

  return {
    ok: true,
    mode: envelope.mode,
    records: store.records.length,
    kdf: envelope.kdf,
    hardwarePlaceholder: envelope.hardwarePlaceholder,
  };
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
