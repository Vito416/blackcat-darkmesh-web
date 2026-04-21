import Dexie, { Table } from "dexie";

import { ManifestDocument } from "../types/manifest";

const DB_NAME = "darkmesh-manifest-cache";
const DB_VERSION = 1;
const MAX_ROWS = 25;

type ManifestCacheRow = {
  tx: string;
  savedAt: string;
  etag?: string | null;
  document: ManifestDocument;
};

class ManifestCacheDatabase extends Dexie {
  manifests!: Table<ManifestCacheRow, string>;

  constructor() {
    super(DB_NAME);
    this.version(DB_VERSION).stores({
      manifests: "tx, savedAt",
    });
  }
}

const db = new ManifestCacheDatabase();

export interface CacheLookupOptions {
  /** Skip stale entries older than this TTL (ms). When omitted, any cached value is returned. */
  ttlMs?: number;
}

export type CacheEntry = ManifestCacheRow;

export async function getCachedManifest(tx: string, options: CacheLookupOptions = {}): Promise<CacheEntry | null> {
  const cached = await db.manifests.get(tx.trim());
  if (!cached) return null;

  if (options.ttlMs != null) {
    const age = Date.now() - new Date(cached.savedAt).getTime();
    if (age > options.ttlMs) return null;
  }

  return cached;
}

export async function putCachedManifest(tx: string, document: ManifestDocument, meta?: { etag?: string | null }) {
  const savedAt = new Date().toISOString();
  await db.manifests.put({ tx: tx.trim(), document, savedAt, etag: meta?.etag ?? null });
  await pruneCache();
}

export async function touchCachedManifest(tx: string): Promise<void> {
  const existing = await db.manifests.get(tx.trim());
  if (!existing) return;
  await db.manifests.put({ ...existing, savedAt: new Date().toISOString() });
}

export async function clearManifestCache(): Promise<void> {
  await db.manifests.clear();
}

async function pruneCache(limit = MAX_ROWS): Promise<void> {
  const total = await db.manifests.count();
  if (total <= limit) return;
  const overflow = total - limit;
  const stale = await db.manifests.orderBy("savedAt").limit(overflow).toArray();
  const staleKeys = stale.map((row) => row.tx);
  if (staleKeys.length) {
    await db.manifests.bulkDelete(staleKeys);
  }
}

export default db;
