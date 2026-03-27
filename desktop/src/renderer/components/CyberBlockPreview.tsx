import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

type CatalogShape =
  | "hero"
  | "cta"
  | "grid"
  | "timeline"
  | "stats"
  | "media"
  | "pricing"
  | "contact"
  | "footer";

export type CyberBlockPreviewProps = {
  shape: CatalogShape;
  theme: string;
  highEffects: boolean;
  reducedMotion: boolean;
  variant?: "card" | "compact";
};

type BlockSpec = { position: THREE.Vector3; scale: THREE.Vector3; colorShift: number; tilt?: number };

const SHAPE_PRESETS: Record<CatalogShape, BlockSpec[][]> = {
  hero: [
    [
      { position: new THREE.Vector3(-1.4, 0.2, 0.2), scale: new THREE.Vector3(2.8, 1, 1.2), colorShift: 0.12 },
      { position: new THREE.Vector3(1.2, -0.35, -0.4), scale: new THREE.Vector3(1.6, 0.7, 1), colorShift: -0.05 },
      { position: new THREE.Vector3(0.4, 0.8, -0.8), scale: new THREE.Vector3(1.8, 0.5, 0.9), colorShift: 0.22 },
    ],
    [
      { position: new THREE.Vector3(-1.5, 0.55, 0.15), scale: new THREE.Vector3(2.1, 0.9, 1.05), colorShift: 0.16 },
      { position: new THREE.Vector3(1.35, -0.1, -0.5), scale: new THREE.Vector3(1.5, 1.05, 0.88), colorShift: 0.02 },
      { position: new THREE.Vector3(0.1, 0.92, -0.92), scale: new THREE.Vector3(1.35, 0.55, 0.92), colorShift: 0.24 },
      { position: new THREE.Vector3(-0.2, -0.7, 0.65), scale: new THREE.Vector3(1.9, 0.34, 1.12), colorShift: 0.08, tilt: 0.05 },
    ],
    [
      { position: new THREE.Vector3(-1.05, 0.28, 0.55), scale: new THREE.Vector3(1.6, 1.25, 0.95), colorShift: 0.14 },
      { position: new THREE.Vector3(1.35, 0.65, -0.35), scale: new THREE.Vector3(1.4, 0.78, 0.98), colorShift: 0.2 },
      { position: new THREE.Vector3(0.05, -0.35, -0.6), scale: new THREE.Vector3(2.2, 0.42, 1.1), colorShift: -0.01 },
    ],
  ],
  cta: [
    [
      { position: new THREE.Vector3(-1.25, 0.05, 0), scale: new THREE.Vector3(2.4, 0.8, 1.1), colorShift: 0.12 },
      { position: new THREE.Vector3(1, 0.4, -0.6), scale: new THREE.Vector3(1.4, 0.6, 0.9), colorShift: 0.18 },
    ],
    [
      { position: new THREE.Vector3(-1.45, 0.2, 0.3), scale: new THREE.Vector3(2.1, 0.82, 0.9), colorShift: 0.16 },
      { position: new THREE.Vector3(1.15, 0.58, -0.35), scale: new THREE.Vector3(1.05, 0.55, 0.92), colorShift: 0.12 },
      { position: new THREE.Vector3(0.05, -0.55, 0.45), scale: new THREE.Vector3(1.85, 0.32, 0.72), colorShift: 0.2, tilt: -0.04 },
    ],
  ],
  grid: [
    [
      { position: new THREE.Vector3(-1.6, 0.2, 0.8), scale: new THREE.Vector3(1, 1, 1), colorShift: 0.14 },
      { position: new THREE.Vector3(0, -0.25, -0.2), scale: new THREE.Vector3(1.05, 0.95, 1), colorShift: -0.02 },
      { position: new THREE.Vector3(1.6, 0.35, 0.4), scale: new THREE.Vector3(1, 1, 1.05), colorShift: 0.22 },
      { position: new THREE.Vector3(0.2, 0.95, -0.9), scale: new THREE.Vector3(0.95, 0.6, 0.95), colorShift: 0.3 },
    ],
    [
      { position: new THREE.Vector3(-1.55, 0.45, 0.55), scale: new THREE.Vector3(0.98, 1.15, 0.96), colorShift: 0.18 },
      { position: new THREE.Vector3(0.05, -0.05, -0.1), scale: new THREE.Vector3(1.08, 1.05, 1.06), colorShift: 0.06 },
      { position: new THREE.Vector3(1.55, 0.25, 0.55), scale: new THREE.Vector3(0.96, 1.12, 1.02), colorShift: 0.22 },
      { position: new THREE.Vector3(0.25, 1.05, -0.95), scale: new THREE.Vector3(0.85, 0.58, 0.82), colorShift: 0.28, tilt: 0.03 },
    ],
    [
      { position: new THREE.Vector3(-1.4, -0.05, 0.2), scale: new THREE.Vector3(0.92, 1.0, 0.9), colorShift: 0.1 },
      { position: new THREE.Vector3(0.0, 0.6, -0.6), scale: new THREE.Vector3(1.05, 0.7, 0.95), colorShift: 0.22 },
      { position: new THREE.Vector3(1.55, -0.1, 0.5), scale: new THREE.Vector3(1.05, 1.1, 1.0), colorShift: 0.16 },
      { position: new THREE.Vector3(-0.05, -0.85, 0.4), scale: new THREE.Vector3(1.6, 0.32, 0.8), colorShift: 0.06 },
    ],
  ],
  timeline: [
    [
      { position: new THREE.Vector3(-1.4, 0.35, 0.5), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: 0.18 },
      { position: new THREE.Vector3(0, -0.15, -0.2), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: -0.02 },
      { position: new THREE.Vector3(1.4, 0.5, 0.4), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: 0.24 },
    ],
    [
      { position: new THREE.Vector3(-1.25, 0.2, 0.55), scale: new THREE.Vector3(1.05, 0.85, 0.98), colorShift: 0.12 },
      { position: new THREE.Vector3(0.1, 0.6, -0.2), scale: new THREE.Vector3(1.2, 0.78, 1.02), colorShift: 0.2 },
      { position: new THREE.Vector3(1.25, 0.15, 0.4), scale: new THREE.Vector3(0.9, 0.8, 0.96), colorShift: 0.26 },
      { position: new THREE.Vector3(0.0, -0.8, 0.5), scale: new THREE.Vector3(1.6, 0.32, 0.72), colorShift: 0.08, tilt: -0.02 },
    ],
  ],
  stats: [
    [
      { position: new THREE.Vector3(-1.2, 0.35, 0.4), scale: new THREE.Vector3(0.9, 1.2, 1), colorShift: 0.14 },
      { position: new THREE.Vector3(0, -0.05, -0.2), scale: new THREE.Vector3(0.95, 0.9, 1), colorShift: 0.05 },
      { position: new THREE.Vector3(1.2, 0.65, 0.3), scale: new THREE.Vector3(0.95, 1.35, 1), colorShift: 0.24 },
    ],
    [
      { position: new THREE.Vector3(-1.05, 0.35, 0.35), scale: new THREE.Vector3(0.9, 1.1, 1.0), colorShift: 0.14 },
      { position: new THREE.Vector3(0.25, 0.05, -0.25), scale: new THREE.Vector3(1.0, 1.25, 1.05), colorShift: 0.18 },
      { position: new THREE.Vector3(1.25, 0.6, 0.2), scale: new THREE.Vector3(0.8, 1.5, 0.98), colorShift: 0.28 },
      { position: new THREE.Vector3(-0.2, -0.75, 0.45), scale: new THREE.Vector3(1.5, 0.32, 0.82), colorShift: 0.1 },
    ],
  ],
  media: [
    [
      { position: new THREE.Vector3(-0.4, 0.4, 0), scale: new THREE.Vector3(2.4, 1.2, 0.4), colorShift: 0.16 },
      { position: new THREE.Vector3(0.9, -0.2, -0.6), scale: new THREE.Vector3(1.6, 0.7, 0.35), colorShift: 0.22 },
    ],
    [
      { position: new THREE.Vector3(-0.55, 0.55, 0.05), scale: new THREE.Vector3(2.6, 1.05, 0.44), colorShift: 0.18 },
      { position: new THREE.Vector3(1.1, -0.15, -0.5), scale: new THREE.Vector3(1.35, 0.72, 0.48), colorShift: 0.24 },
      { position: new THREE.Vector3(-1.35, -0.35, 0.45), scale: new THREE.Vector3(0.64, 0.55, 0.72), colorShift: 0.12 },
    ],
  ],
  pricing: [
    [
      { position: new THREE.Vector3(-1.4, 0.45, 0.5), scale: new THREE.Vector3(1, 1.2, 1), colorShift: 0.16 },
      { position: new THREE.Vector3(0, 0, -0.2), scale: new THREE.Vector3(1, 1, 1), colorShift: -0.02 },
      { position: new THREE.Vector3(1.4, 0.65, 0.3), scale: new THREE.Vector3(1, 1.35, 1), colorShift: 0.24 },
    ],
    [
      { position: new THREE.Vector3(-1.6, 0.5, 0.45), scale: new THREE.Vector3(0.95, 1.28, 0.98), colorShift: 0.16 },
      { position: new THREE.Vector3(0.0, 0.1, -0.18), scale: new THREE.Vector3(1.1, 1.08, 1.05), colorShift: 0.02 },
      { position: new THREE.Vector3(1.6, 0.7, 0.28), scale: new THREE.Vector3(1.0, 1.35, 1.02), colorShift: 0.26 },
      { position: new THREE.Vector3(0.0, -0.75, 0.55), scale: new THREE.Vector3(1.9, 0.34, 0.82), colorShift: 0.1, tilt: -0.03 },
    ],
  ],
  contact: [
    [
      { position: new THREE.Vector3(-1.3, 0.4, 0.4), scale: new THREE.Vector3(1.2, 1, 1), colorShift: 0.1 },
      { position: new THREE.Vector3(0.5, 0.1, -0.3), scale: new THREE.Vector3(1.4, 0.8, 1), colorShift: 0.2 },
      { position: new THREE.Vector3(1.6, 0.55, 0.2), scale: new THREE.Vector3(0.85, 1, 1), colorShift: 0.28 },
    ],
    [
      { position: new THREE.Vector3(-1.35, 0.38, 0.45), scale: new THREE.Vector3(1.2, 1.1, 0.96), colorShift: 0.14 },
      { position: new THREE.Vector3(0.15, -0.05, -0.25), scale: new THREE.Vector3(1.55, 0.9, 1.02), colorShift: 0.22 },
      { position: new THREE.Vector3(1.55, 0.55, 0.2), scale: new THREE.Vector3(0.92, 1.1, 0.92), colorShift: 0.28 },
      { position: new THREE.Vector3(-0.15, -0.75, 0.35), scale: new THREE.Vector3(1.7, 0.34, 0.82), colorShift: 0.12 },
    ],
  ],
  footer: [
    [
      { position: new THREE.Vector3(0, 0.15, 0), scale: new THREE.Vector3(3.1, 0.9, 1.1), colorShift: 0.08 },
      { position: new THREE.Vector3(0.2, 0.65, -0.6), scale: new THREE.Vector3(2.2, 0.5, 0.9), colorShift: 0.2 },
    ],
    [
      { position: new THREE.Vector3(0, 0.18, 0.1), scale: new THREE.Vector3(3.2, 0.88, 1.05), colorShift: 0.12 },
      { position: new THREE.Vector3(-0.7, 0.62, -0.55), scale: new THREE.Vector3(1.35, 0.42, 0.92), colorShift: 0.18 },
      { position: new THREE.Vector3(1.0, -0.45, 0.65), scale: new THREE.Vector3(1.1, 0.32, 0.78), colorShift: 0.1, tilt: -0.05 },
    ],
  ],
};

const readCssColor = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
};

const readCssNumber = (token: string, fallback: number) => {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token);
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const CyberBlockPreview: React.FC<CyberBlockPreviewProps> = ({ shape, theme, highEffects, reducedMotion, variant = "card" }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  const palette = useMemo(() => {
    const accent = readCssColor("--accent", "#0ea5e9");
    const accentStrong = readCssColor("--accent-strong", "#22c55e");
    const surface = readCssColor("--surface", "#0b1224");
    return { accent, accentStrong, surface };
  }, [theme]);

  const fx = useMemo(() => {
    return {
      roughness: readCssNumber("--fx-roughness", 0.35),
      metalness: readCssNumber("--fx-metalness", 0.12),
      emissiveBoost: readCssNumber("--fx-emissive-boost", 0.1),
      envIntensity: readCssNumber("--fx-env-intensity", 0.2),
      fresnel: readCssNumber("--fx-fresnel", 0.35),
    };
  }, [theme]);

  const preset = useMemo(() => {
    const pools = SHAPE_PRESETS[shape] || [];
    if (!pools.length) return [] as BlockSpec[];

    if (!highEffects || reducedMotion) return pools[0];

    const seed = `${shape}-${theme}-${variant}`;
    const hash = seed
      .split("")
      .reduce((acc, char) => (acc * 31 + char.charCodeAt(0)) % 9973, 7 + pools.length);
    return pools[hash % pools.length];
  }, [highEffects, reducedMotion, shape, theme, variant]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const node = mountRef.current;
    if (!node) return;

    if (!highEffects || reducedMotion) {
      setVisible(false);
      return;
    }

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const intersecting = entries.some((entry) => entry.isIntersecting);
        setVisible(intersecting);
      },
      { threshold: 0.1 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [highEffects, reducedMotion]);

  useEffect(() => {
    if (!visible || reducedMotion || !highEffects) return;

    const mount = mountRef.current;
    const canvas = canvasRef.current;
    const blocks = preset.length ? preset : SHAPE_PRESETS[shape]?.[0] || [];
    if (!mount || !canvas || blocks.length === 0) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let group: THREE.Group | null = null;
    let frame = 0;
    let disposed = false;
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const materialCache = new Map<string, THREE.MeshStandardMaterial>();
    const targetRot = { x: -0.22, y: 0.32 };
    const currentRot = { x: -0.22, y: 0.32 };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.4));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.94;

    const resize = () => {
      if (!mount || !renderer || !camera) return;
      const rect = mount.getBoundingClientRect();
      const width = Math.max(rect.width, 60);
      const height = Math.max(rect.height, 60);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    scene = new THREE.Scene();
    scene.background = null;
    camera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    camera.position.set(4, 3.4, 8.2);

    const ambient = new THREE.AmbientLight(palette.surface, 0.32);
    scene.add(ambient);
    const hemi = new THREE.HemisphereLight(palette.accent, palette.surface, 0.28);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(palette.accent, 1.1 + fx.envIntensity * 0.5);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(palette.accentStrong, 0.9 + fx.emissiveBoost * 0.5);
    rimLight.position.set(-4, 5, -3);
    scene.add(rimLight);

    const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
    geometries.add(baseGeometry);
    const accentColor = new THREE.Color(palette.accent);
    const accentStrongColor = new THREE.Color(palette.accentStrong);
    const baseColor = new THREE.Color(palette.surface);

    const getMaterial = (shift: number) => {
      const key = shift.toFixed(3);
      const cached = materialCache.get(key);
      if (cached) return cached;
      const mat = new THREE.MeshStandardMaterial({
        color: baseColor.clone().lerp(accentColor, 0.18 + shift),
        emissive: accentStrongColor.clone().multiplyScalar(0.08 + Math.max(0, shift + fx.emissiveBoost) * 0.5),
        emissiveIntensity: 1 + fx.emissiveBoost * 0.6,
        roughness: Math.min(1, Math.max(0, fx.roughness)),
        metalness: Math.min(1, Math.max(0, fx.metalness)),
        envMapIntensity: fx.envIntensity,
        flatShading: true,
      });
      materialCache.set(key, mat);
      materials.add(mat);
      return mat;
    };

    group = new THREE.Group();
    blocks.forEach((spec, index) => {
      const mesh = new THREE.Mesh(baseGeometry, getMaterial(spec.colorShift));
      mesh.position.copy(spec.position);
      mesh.scale.copy(spec.scale);
      mesh.rotation.y = 0.18 * index;
      if (spec.tilt) {
        mesh.rotation.z += spec.tilt;
        mesh.rotation.x += spec.tilt * 0.35;
      }
      group?.add(mesh);
    });

    const planeGeometry = new THREE.PlaneGeometry(12, 8);
    geometries.add(planeGeometry);
    const planeMaterial = new THREE.MeshStandardMaterial({
      color: baseColor.clone().lerp(accentColor, 0.08),
      transparent: true,
      opacity: 0.62,
      roughness: Math.min(1, fx.roughness + 0.1),
      metalness: fx.metalness * 0.2,
    });
    materials.add(planeMaterial);
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(0, -1.45, 0);
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    scene.add(group);

    const handlePointerMove = (event: PointerEvent) => {
      if (!mount) return;
      const rect = mount.getBoundingClientRect();
      const x = rect.width ? (event.clientX - rect.left) / rect.width - 0.5 : 0;
      const y = rect.height ? (event.clientY - rect.top) / rect.height - 0.5 : 0;
      targetRot.x = -0.18 + y * -0.4;
      targetRot.y = 0.28 + x * 0.6;
    };

    const handlePointerLeave = () => {
      targetRot.x = -0.22;
      targetRot.y = 0.32;
    };

    const damping = variant === "compact" ? 0.1 : 0.08;
    const wobble = 0.12 + fx.fresnel * 0.04;

    const animate = (time: number) => {
      if (!renderer || !scene || !camera || !group || disposed) return;
      currentRot.x += (targetRot.x - currentRot.x) * damping;
      currentRot.y += (targetRot.y - currentRot.y) * damping;
      group.rotation.set(currentRot.x, currentRot.y, 0);
      group.position.y = Math.sin(time * 0.0018) * wobble;
      group.position.x = Math.cos(time * 0.0013) * wobble * 0.5;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    };

    const handleResize = () => resize();

    resize();
    frame = requestAnimationFrame(animate);

    mount.addEventListener("pointermove", handlePointerMove, { passive: true });
    mount.addEventListener("pointerleave", handlePointerLeave);
    window.addEventListener("resize", handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      mount.removeEventListener("pointermove", handlePointerMove);
      mount.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("resize", handleResize);
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss?.();
      }
      geometries.forEach((geo) => geo.dispose());
      materials.forEach((mat) => mat.dispose());
      materialCache.clear();
      scene?.clear();
    };
  }, [fx.emissiveBoost, fx.envIntensity, fx.fresnel, fx.metalness, fx.roughness, highEffects, palette.accent, palette.accentStrong, palette.surface, preset, reducedMotion, shape, variant, visible]);

  const active = visible && highEffects && !reducedMotion;

  return (
    <div
      ref={mountRef}
      className={`cyber-block-preview ${variant}`}
      aria-hidden
      data-theme={theme}
      data-reduced-motion={reducedMotion ? "true" : undefined}
    >
      <canvas ref={canvasRef} className="cyber-block-canvas" />
      {!active && (
        <div className={`cyber-block-fallback ${reducedMotion ? "reduced" : ""}`}>
          <div className="cyber-block-fallback-inner">
            <span className="placeholder-chip" />
            <span className="placeholder-line wide" />
            <span className="placeholder-line short" />
            {reducedMotion && <span className="reduced-note">FX paused for reduced motion</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default CyberBlockPreview;
