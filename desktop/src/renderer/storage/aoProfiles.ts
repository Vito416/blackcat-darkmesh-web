import type { AoDeployProfile, AoProfileSnapshot } from "../types/ao";

const STORAGE_KEY = "ao-deploy-profiles";
const MAX_PROFILES = 5;

const randomId = () => crypto.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);

const persist = (profiles: AoDeployProfile[]): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // ignore storage failures
  }
};

export const loadAoProfiles = (): AoDeployProfile[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => ({
        ...entry,
        id: entry.id ?? `ao-prof-${randomId()}`,
      }))
      .slice(0, MAX_PROFILES);
  } catch {
    return [];
  }
};

const deriveLabel = (snapshot: AoProfileSnapshot): string => {
  if (snapshot.label?.trim()) return snapshot.label.trim();
  if (snapshot.manifestTx) return `manifest ${snapshot.manifestTx.slice(0, 8)}…`;
  if (snapshot.moduleTx) return `module ${snapshot.moduleTx.slice(0, 8)}…`;
  return "ao profile";
};

export const rememberProfile = (
  snapshot: AoProfileSnapshot,
  currentProfiles?: AoDeployProfile[],
): { profile: AoDeployProfile; profiles: AoDeployProfile[] } => {
  const profiles = currentProfiles ?? loadAoProfiles();
  const now = new Date().toISOString();
  const match = snapshot.id
    ? profiles.find((entry) => entry.id === snapshot.id)
    : profiles.find(
        (entry) =>
          entry.moduleTx === snapshot.moduleTx &&
          entry.scheduler === snapshot.scheduler &&
          entry.walletMode === snapshot.walletMode &&
          entry.manifestTx === snapshot.manifestTx,
      );

  const label = deriveLabel(snapshot);
  const profile: AoDeployProfile = {
    id: match?.id ?? snapshot.id ?? `ao-prof-${randomId()}`,
    label: match?.label ?? label,
    walletMode: snapshot.walletMode,
    walletPath: snapshot.walletMode === "path" ? snapshot.walletPath ?? match?.walletPath ?? null : null,
    moduleTx: snapshot.moduleTx ?? match?.moduleTx ?? null,
    manifestTx: snapshot.manifestTx ?? match?.manifestTx ?? null,
    scheduler: snapshot.scheduler ?? match?.scheduler ?? null,
    dryRun: snapshot.dryRun ?? match?.dryRun ?? false,
    lastKind: snapshot.lastKind,
    createdAt: match?.createdAt ?? now,
    updatedAt: now,
  };

  const next = [profile, ...profiles.filter((entry) => entry.id !== profile.id)].slice(0, MAX_PROFILES);
  persist(next);
  return { profile, profiles: next };
};

export const deleteProfile = (id: string): AoDeployProfile[] => {
  const next = loadAoProfiles().filter((entry) => entry.id !== id);
  persist(next);
  return next;
};

export const clearProfiles = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
};
