import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type HeroMode = "idle" | "webgl" | "fallback";

type HeroCanvasProps = {
  theme: "light" | "cyberpunk";
};

const PARTICLE_COUNT = 220;
const FRAME_INTERVAL = 1000 / 30; // throttle to ~30fps to keep perf steady

const cssColor = (value: string, fallback: string) => value.trim() || fallback;

const HeroCanvas: React.FC<HeroCanvasProps> = ({ theme }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<HeroMode>("idle");

  useEffect(() => {
    const mount = mountRef.current;
    const canvas = canvasRef.current;

    if (!mount || !canvas || theme !== "cyberpunk") {
      setMode("idle");
      return;
    }

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      setMode("fallback");
      return;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let particles: THREE.Points | null = null;
    let particleGeometry: THREE.BufferGeometry | null = null;
    let gradientMesh: THREE.Mesh | null = null;
    let animationFrame = 0;
    let disposed = false;

    const pointer = { x: 0, y: 0 };
    const handlePointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 1.15;
      pointer.y = -(event.clientY / window.innerHeight - 0.5) * 0.75;
    };

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      disposed = true;
      cancelAnimationFrame(animationFrame);
      setMode("fallback");
    };

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
      });
    } catch (err) {
      setMode("fallback");
      return;
    }

    const gl = renderer.getContext();
    if (!gl) {
      renderer.dispose();
      setMode("fallback");
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.setClearColor(0x000000, 0);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 0.35, 9);

    const rootStyle = getComputedStyle(document.documentElement);
    const accent = cssColor(rootStyle.getPropertyValue("--accent"), "#00eaff");
    const accentStrong = cssColor(rootStyle.getPropertyValue("--accent-strong"), "#ff2ddf");
    const accentColor = new THREE.Color(accent);
    const accentStrongColor = new THREE.Color(accentStrong);

    const gradientMaterial = new THREE.ShaderMaterial({
      uniforms: {
        color1: { value: accentStrongColor },
        color2: { value: accentColor },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 color1;
        uniform vec3 color2;
        void main() {
          vec3 col = mix(color1, color2, smoothstep(0.0, 1.0, vUv.y));
          float alpha = 0.78 * (1.0 - vUv.y * 0.32);
          gl_FragColor = vec4(col, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
    });

    gradientMesh = new THREE.Mesh(new THREE.PlaneGeometry(14, 8, 1, 1), gradientMaterial);
    gradientMesh.position.set(0, -0.28, -6.4);
    gradientMesh.rotation.set(-0.18, 0.22, 0);
    scene.add(gradientMesh);

    particleGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const speeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = (Math.random() - 0.3) * 7;
      positions[i * 3 + 2] = -Math.random() * 6 - 1;
      speeds[i] = 0.0014 + Math.random() * 0.0036;
    }
    particleGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute("speed", new THREE.BufferAttribute(speeds, 1));

    const particleMaterial = new THREE.PointsMaterial({
      color: accentColor,
      size: 0.08,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    particles = new THREE.Points(particleGeometry, particleMaterial);
    particles.rotation.x = -0.28;
    scene.add(particles);

    const resize = () => {
      if (!renderer || !camera || !mount) return;
      const width = mount.clientWidth || window.innerWidth;
      const height = mount.clientHeight || 320;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();

    let lastFrame = 0;
    const renderFrame = (time: number) => {
      if (disposed) return;

      if (time - lastFrame >= FRAME_INTERVAL) {
        lastFrame = time;

        if (particles && particleGeometry) {
          const positionAttr = particleGeometry.getAttribute("position") as THREE.BufferAttribute;
          const speedAttr = particleGeometry.getAttribute("speed") as THREE.BufferAttribute;
          for (let i = 0; i < positionAttr.count; i += 1) {
            const nextY = positionAttr.getY(i) + speedAttr.getX(i);
            const nextZ = positionAttr.getZ(i) + speedAttr.getX(i) * 0.5;
            positionAttr.setY(i, nextY > 4 ? -3.4 : nextY);
            positionAttr.setZ(i, nextZ > -0.4 ? -6.5 : nextZ);
          }
          positionAttr.needsUpdate = true;
          particles.rotation.z += 0.0008;
        }

        if (camera) {
          camera.position.x += (pointer.x - camera.position.x) * 0.035;
          camera.position.y += (pointer.y - camera.position.y) * 0.035;
          camera.lookAt(0, 0, -6.5);
        }

        if (gradientMesh) {
          gradientMesh.rotation.y += (pointer.x * 0.25 - gradientMesh.rotation.y) * 0.05;
          gradientMesh.rotation.x += (-0.18 + pointer.y * 0.25 - gradientMesh.rotation.x) * 0.05;
        }

        renderer?.render(scene as THREE.Scene, camera as THREE.PerspectiveCamera);
      }

      animationFrame = requestAnimationFrame(renderFrame);
    };

    setMode("webgl");
    animationFrame = requestAnimationFrame(renderFrame);

    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("pointermove", handlePointerMove, { passive: true });
    canvas.addEventListener("webglcontextlost", handleContextLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      gradientMesh?.geometry.dispose();
      if (gradientMesh?.material instanceof THREE.Material) {
        gradientMesh.material.dispose();
      }
      particleGeometry?.dispose();
      renderer?.dispose();
      setMode("idle");
    };
  }, [theme]);

  return (
    <div ref={mountRef} className="hero-stage" data-mode={mode} aria-hidden="true">
      <canvas ref={canvasRef} className="hero-canvas" />
      <div className="hero-fallback">
        <div className="hero-fallback-layer glow" />
        <div className="hero-fallback-layer grid" />
        <div className="hero-fallback-layer haze" />
      </div>
    </div>
  );
};

export default HeroCanvas;
