import React, { useMemo } from "react";

export type VaultHexLockProps = {
  locked: boolean;
  strength: number; // 0-4
  busy?: boolean;
  label?: string;
};

const clampStrength = (value: number) => Math.max(0, Math.min(4, value));

export const VaultHexLock: React.FC<VaultHexLockProps> = ({ locked, strength, busy = false, label }) => {
  const normalized = clampStrength(strength ?? 0);
  const tone = useMemo(() => {
    if (locked) return "locked";
    if (normalized >= 4) return "strong";
    if (normalized >= 3) return "good";
    if (normalized >= 2) return "fair";
    if (normalized >= 1) return "weak";
    return "idle";
  }, [locked, normalized]);

  const ariaLabel = label ?? (locked ? "Vault locked" : `Vault unlocked, strength ${normalized}/4`);

  return (
    <div
      className="vault-hex-lock"
      role="img"
      aria-label={ariaLabel}
      data-state={locked ? "locked" : "unlocked"}
      data-tone={tone}
      data-busy={busy ? "true" : undefined}
      title={ariaLabel}
    >
      <div className="vault-hex-core">
        <span className="vault-hex-dot" />
        <span className="vault-hex-badge">{locked ? "LOCK" : "OPEN"}</span>
      </div>
      <div className="vault-hex-ring ring-a" />
      <div className="vault-hex-ring ring-b" />
      <div className="vault-hex-ring ring-c" />
      <div className="vault-hex-ripple" aria-hidden />
    </div>
  );
};

export default VaultHexLock;
