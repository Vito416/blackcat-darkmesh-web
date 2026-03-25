import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type VaultCrystalState = "locked" | "unlocked" | "password";
export type VaultCrystalPulse = "unlock" | "backup" | null;

type VaultCrystalProps = {
  state: VaultCrystalState;
  pulse?: VaultCrystalPulse;
  label?: string;
};

type CrystalPalette = {
  base: string;
  emissive: string;
  ring: string;
  glow: string;
};

const paletteForState = (state: VaultCrystalState): CrystalPalette => {
  if (state === "locked") {
    return {
      base: "#ef4444",
      emissive: "#f97316",
      ring: "#f87171",
      glow: "#fb7185",
    };
  }

  if (state === "password") {
    return {
      base: "#6366f1",
      emissive: "#8b5cf6",
      ring: "#a855f7",
      glow: "#60a5fa",
    };
  }

  return {
    base: "#22c55e",
    emissive: "#16a34a",
    ring: "#34d399",
    glow: "#2dd4bf",
  };
};

const usePrefersReducedMotion = (): boolean => {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(media.matches);
    const listener = (event: MediaQueryListEvent) => setPrefers(event.matches);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  return prefers;
};

const VaultCrystal: React.FC<VaultCrystalProps> = ({ state, pulse = null, label = "Vault security indicator" }) => {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const crystalMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null);
  const ringMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hazeMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const glowLightRef = useRef<THREE.PointLight | null>(null);
  const frameRef = useRef<number | null>(null);
  const pulseRef = useRef<VaultCrystalPulse>(pulse);
  const prefersReducedMotion = usePrefersReducedMotion();
  const palette = useMemo(() => paletteForState(state), [state]);

  useEffect(() => {
    pulseRef.current = pulse;
  }, [pulse]);

  useEffect(() => {
    crystalMaterialRef.current?.color.set(palette.base);
    crystalMaterialRef.current?.emissive.set(palette.emissive);
    ringMaterialRef.current?.color.set(palette.ring);
    hazeMaterialRef.current?.color.set(palette.ring);
    if (glowLightRef.current) {
      glowLightRef.current.color.set(palette.glow);
    }
  }, [palette]);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const host = canvasHostRef.current;
    if (!host) return;

    const { width: rawWidth, height: rawHeight } = host.getBoundingClientRect();
    const width = rawWidth || 140;
    const height = rawHeight || 86;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(26, width / height, 0.1, 100);
    camera.position.set(0, 0, 5.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio ?? 1, 2));
    host.innerHTML = "";
    host.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.52);
    scene.add(ambient);

    const glowLight = new THREE.PointLight(palette.glow, 2.2, 9.5);
    glowLight.position.set(2.1, 1.6, 3.4);
    scene.add(glowLight);
    glowLightRef.current = glowLight;

    const rimLight = new THREE.PointLight(0x8ec5ff, 1.3, 10);
    rimLight.position.set(-2, -1, -3);
    scene.add(rimLight);

    const crystalGeometry = new THREE.OctahedronGeometry(1.05, 1);
    const crystalMaterial = new THREE.MeshStandardMaterial({
      color: palette.base,
      emissive: palette.emissive,
      emissiveIntensity: 0.28,
      metalness: 0.36,
      roughness: 0.2,
      flatShading: true,
    });
    crystalMaterialRef.current = crystalMaterial;
    const crystal = new THREE.Mesh(crystalGeometry, crystalMaterial);
    scene.add(crystal);

    const ringGeometry = new THREE.TorusGeometry(1.4, 0.05, 12, 72);
    const ringMaterial = new THREE.MeshBasicMaterial({ color: palette.ring, transparent: true, opacity: 0.62 });
    ringMaterialRef.current = ringMaterial;
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.rotation.x = Math.PI / 2.5;
    scene.add(ring);

    const hazeMaterial = new THREE.MeshBasicMaterial({
      color: palette.ring,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
    });
    hazeMaterialRef.current = hazeMaterial;
    const haze = new THREE.Mesh(new THREE.SphereGeometry(0.9, 18, 18), hazeMaterial);
    scene.add(haze);

    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();

      crystal.rotation.x = elapsed * 0.65;
      crystal.rotation.y = elapsed * 0.92;
      ring.rotation.z = elapsed * 0.28;

      const pulsing = pulseRef.current;
      const baseBreath = 1 + 0.02 * Math.sin(elapsed * 3.2);
      const pulseScale =
        pulsing === "unlock"
          ? 1 + 0.08 * Math.sin(elapsed * 6.5)
          : pulsing === "backup"
            ? 1 + 0.1 * Math.sin(elapsed * 8)
            : baseBreath;
      crystal.scale.setScalar(0.96 * pulseScale);

      const emissivePulse =
        pulsing === null ? 0.28 + 0.06 * Math.sin(elapsed * 2.4) : 0.42 + 0.18 * Math.sin(elapsed * 6);
      crystalMaterial.emissiveIntensity = emissivePulse;
      glowLight.intensity = (pulsing ? 2.5 : 1.9) * (1 + 0.06 * Math.sin(elapsed * 4));

      renderer.render(scene, camera);
      frameRef.current = requestAnimationFrame(animate);
    };

    animate();

    const handleResize = () => {
      if (!rendererRef.current) return;
      const { width: nextWidth, height: nextHeight } = host.getBoundingClientRect();
      const safeWidth = nextWidth || 140;
      const safeHeight = nextHeight || 86;
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      rendererRef.current.setSize(safeWidth, safeHeight);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", handleResize);
      crystalGeometry.dispose();
      crystalMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
      haze.geometry.dispose();
      hazeMaterial.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement)) {
        host.removeChild(renderer.domElement);
      }
    };
    // We intentionally depend only on reduced motion to avoid re-instantiating the scene unnecessarily.
    // Palette updates are handled by the palette effect above.
  }, [prefersReducedMotion]);

  const ariaLabel = `${label}: ${state}${pulse ? `, ${pulse}` : ""}`;

  return (
    <div className="vault-crystal-shell" role="img" aria-label={ariaLabel} data-state={state} data-pulse={pulse ?? undefined}>
      <div className="vault-crystal-static" aria-hidden data-state={state} data-pulse={pulse ?? undefined}>
        <span className="vault-crystal-glyph" />
      </div>
      {!prefersReducedMotion && <div className="vault-crystal-canvas" ref={canvasHostRef} aria-hidden />}
    </div>
  );
};

export default VaultCrystal;
