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

type CyberBlockPreviewProps = {
  shape: CatalogShape;
  theme: string;
  highEffects: boolean;
  reducedMotion: boolean;
  variant?: "card" | "compact";
};

type BlockSpec = { position: THREE.Vector3; scale: THREE.Vector3; colorShift: number };

const SHAPE_BLOCKS: Record<CatalogShape, BlockSpec[]> = {
  hero: [
    { position: new THREE.Vector3(-1.4, 0.2, 0.2), scale: new THREE.Vector3(2.8, 1, 1.2), colorShift: 0.12 },
    { position: new THREE.Vector3(1.2, -0.35, -0.4), scale: new THREE.Vector3(1.6, 0.7, 1), colorShift: -0.05 },
    { position: new THREE.Vector3(0.4, 0.8, -0.8), scale: new THREE.Vector3(1.8, 0.5, 0.9), colorShift: 0.22 },
  ],
  cta: [
    { position: new THREE.Vector3(-1.25, 0.05, 0), scale: new THREE.Vector3(2.4, 0.8, 1.1), colorShift: 0.12 },
    { position: new THREE.Vector3(1, 0.4, -0.6), scale: new THREE.Vector3(1.4, 0.6, 0.9), colorShift: 0.18 },
  ],
  grid: [
    { position: new THREE.Vector3(-1.6, 0.2, 0.8), scale: new THREE.Vector3(1, 1, 1), colorShift: 0.14 },
    { position: new THREE.Vector3(0, -0.25, -0.2), scale: new THREE.Vector3(1.05, 0.95, 1), colorShift: -0.02 },
    { position: new THREE.Vector3(1.6, 0.35, 0.4), scale: new THREE.Vector3(1, 1, 1.05), colorShift: 0.22 },
    { position: new THREE.Vector3(0.2, 0.95, -0.9), scale: new THREE.Vector3(0.95, 0.6, 0.95), colorShift: 0.3 },
  ],
  timeline: [
    { position: new THREE.Vector3(-1.4, 0.35, 0.5), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: 0.18 },
    { position: new THREE.Vector3(0, -0.15, -0.2), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: -0.02 },
    { position: new THREE.Vector3(1.4, 0.5, 0.4), scale: new THREE.Vector3(1.2, 0.8, 1), colorShift: 0.24 },
  ],
  stats: [
    { position: new THREE.Vector3(-1.2, 0.35, 0.4), scale: new THREE.Vector3(0.9, 1.2, 1), colorShift: 0.14 },
    { position: new THREE.Vector3(0, -0.05, -0.2), scale: new THREE.Vector3(0.95, 0.9, 1), colorShift: 0.05 },
    { position: new THREE.Vector3(1.2, 0.65, 0.3), scale: new THREE.Vector3(0.95, 1.35, 1), colorShift: 0.24 },
  ],
  media: [
    { position: new THREE.Vector3(-0.4, 0.4, 0), scale: new THREE.Vector3(2.4, 1.2, 0.4), colorShift: 0.16 },
    { position: new THREE.Vector3(0.9, -0.2, -0.6), scale: new THREE.Vector3(1.6, 0.7, 0.35), colorShift: 0.22 },
  ],
  pricing: [
    { position: new THREE.Vector3(-1.4, 0.45, 0.5), scale: new THREE.Vector3(1, 1.2, 1), colorShift: 0.16 },
    { position: new THREE.Vector3(0, 0, -0.2), scale: new THREE.Vector3(1, 1, 1), colorShift: -0.02 },
    { position: new THREE.Vector3(1.4, 0.65, 0.3), scale: new THREE.Vector3(1, 1.35, 1), colorShift: 0.24 },
  ],
  contact: [
    { position: new THREE.Vector3(-1.3, 0.4, 0.4), scale: new THREE.Vector3(1.2, 1, 1), colorShift: 0.1 },
    { position: new THREE.Vector3(0.5, 0.1, -0.3), scale: new THREE.Vector3(1.4, 0.8, 1), colorShift: 0.2 },
    { position: new THREE.Vector3(1.6, 0.55, 0.2), scale: new THREE.Vector3(0.85, 1, 1), colorShift: 0.28 },
  ],
  footer: [
    { position: new THREE.Vector3(0, 0.15, 0), scale: new THREE.Vector3(3.1, 0.9, 1.1), colorShift: 0.08 },
    { position: new THREE.Vector3(0.2, 0.65, -0.6), scale: new THREE.Vector3(2.2, 0.5, 0.9), colorShift: 0.2 },
  ],
};

const readCssColor = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
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
    if (!mount || !canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let group: THREE.Group | null = null;
    let frame = 0;
    let disposed = false;
    const targetRot = { x: -0.22, y: 0.32 };
    const currentRot = { x: -0.22, y: 0.32 };

    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
    } catch {
      return;
    }

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

    const ambient = new THREE.AmbientLight(palette.surface, 0.34);
    scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(palette.accent, 1.15);
    keyLight.position.set(3, 4, 4);
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(palette.accentStrong, 0.9);
    rimLight.position.set(-4, 5, -3);
    scene.add(rimLight);

    const baseGeometry = new THREE.BoxGeometry(1, 1, 1);
    const accentColor = new THREE.Color(palette.accent);
    const accentStrongColor = new THREE.Color(palette.accentStrong);
    const baseColor = new THREE.Color(palette.surface);

    const material = new THREE.MeshStandardMaterial({
      color: baseColor,
      emissive: accentStrongColor.clone().multiplyScalar(0.08),
      roughness: 0.35,
      metalness: 0.08,
    });

    group = new THREE.Group();
    SHAPE_BLOCKS[shape].forEach((spec, index) => {
      const mesh = new THREE.Mesh(baseGeometry, material.clone());
      mesh.position.copy(spec.position);
      mesh.scale.copy(spec.scale);
      const lerpColor = baseColor.clone().lerp(accentColor, 0.18 + spec.colorShift);
      (mesh.material as THREE.MeshStandardMaterial).color = lerpColor;
      (mesh.material as THREE.MeshStandardMaterial).emissive = accentStrongColor
        .clone()
        .multiplyScalar(0.12 + spec.colorShift * 0.6);
      mesh.rotation.y = 0.18 * index;
      group?.add(mesh);
    });

    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 8),
      new THREE.MeshBasicMaterial({
        color: baseColor.clone().lerp(accentColor, 0.08),
        transparent: true,
        opacity: 0.6,
      }),
    );
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

    const animate = (time: number) => {
      if (!renderer || !scene || !camera || !group || disposed) return;
      currentRot.x += (targetRot.x - currentRot.x) * 0.08;
      currentRot.y += (targetRot.y - currentRot.y) * 0.08;
      group.rotation.set(currentRot.x, currentRot.y, 0);
      group.position.y = Math.sin(time * 0.0018) * 0.12;
      group.position.x = Math.cos(time * 0.0013) * 0.06;
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
      scene?.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      scene?.clear();
    };
  }, [highEffects, palette.accent, palette.accentStrong, palette.surface, reducedMotion, shape, visible]);

  const active = visible && highEffects && !reducedMotion;

  return (
    <div
      ref={mountRef}
      className={`cyber-block-preview ${variant}`}
      aria-hidden
      data-theme={theme}
    >
      <canvas ref={canvasRef} className="cyber-block-canvas" />
      {!active && (
        <div className="cyber-block-fallback">
          <div className="cyber-block-fallback-inner">
            <span className="placeholder-chip" />
            <span className="placeholder-line wide" />
            <span className="placeholder-line short" />
          </div>
        </div>
      )}
    </div>
  );
};

export default CyberBlockPreview;
