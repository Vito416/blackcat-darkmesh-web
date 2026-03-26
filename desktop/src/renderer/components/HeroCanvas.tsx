import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type HeroMode = "idle" | "webgl" | "fallback";

type ThemeName = "light" | "cyberpunk" | "night-drive" | "vapor" | "synthwave" | "void";

type HeroCanvasProps = {
  theme: ThemeName;
  highEffects: boolean;
};

const PARTICLE_COUNT = 220;
const FRAME_INTERVAL = 1000 / 30; // throttle to ~30fps to keep perf steady

const cssColor = (value: string, fallback: string) => value.trim() || fallback;

const HeroCanvas: React.FC<HeroCanvasProps> = ({ theme, highEffects }) => {
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

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (reduceMotion || !highEffects) {
      setMode("fallback");
      return;
    }

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let particles: THREE.Points | null = null;
    let particleGeometry: THREE.BufferGeometry | null = null;
    let gradientMesh: THREE.Mesh | null = null;
    let gridMesh: THREE.Mesh | null = null;
    let gridGeometry: THREE.PlaneGeometry | null = null;
    let gridMaterial: THREE.ShaderMaterial | null = null;
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
    camera.position.set(0, 1.1, 9.6);

    const rootStyle = getComputedStyle(document.documentElement);
    const accent = cssColor(rootStyle.getPropertyValue("--accent"), "#00eaff");
    const accentStrong = cssColor(rootStyle.getPropertyValue("--accent-strong"), "#ff2ddf");
    const fogBase = cssColor(rootStyle.getPropertyValue("--bg"), "#040815");
    const accentColor = new THREE.Color(accent);
    const accentStrongColor = new THREE.Color(accentStrong);
    const fogColor = new THREE.Color(fogBase);
    scene.fog = new THREE.FogExp2(fogColor, 0.085);

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

    const gridUniforms = {
      time: { value: 0 },
      color1: { value: accentStrongColor },
      color2: { value: accentColor },
      fogColor: { value: fogColor },
      fogNear: { value: 5.5 },
      fogFar: { value: 18.0 },
    } satisfies Record<string, { value: number | THREE.Color }>;

    gridMaterial = new THREE.ShaderMaterial({
      uniforms: gridUniforms,
      vertexShader: `
        varying vec2 vUv;
        varying float vDepth;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vDepth = -worldPosition.z;
          vUv = position.xz * 0.42;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        #ifdef GL_OES_standard_derivatives
        #extension GL_OES_standard_derivatives : enable
        #endif
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        uniform vec3 fogColor;
        uniform float fogNear;
        uniform float fogFar;
        varying vec2 vUv;
        varying float vDepth;

        float gridLine(vec2 uv, float thickness) {
          vec2 cell = abs(fract(uv) - 0.5);
          float line = min(cell.x, cell.y);
          float aa = min(fwidth(uv.x), fwidth(uv.y));
          return 1.0 - smoothstep(thickness, thickness + aa, line);
        }

        void main() {
          vec2 uv = vUv;
          uv.y += time * 0.55;

          float major = gridLine(uv * 0.55, 0.035);
          float minor = gridLine(uv, 0.02) * 0.85;
          float grid = max(major, minor);

          float pulse = sin((uv.y + time * 0.75) * 0.6) * 0.5 + 0.5;
          vec3 neon = mix(color1, color2, pulse);

          float depthFog = smoothstep(fogNear, fogFar, vDepth);
          float intensity = grid * (1.15 - depthFog * 0.7);
          vec3 color = neon * intensity;

          color = mix(color, fogColor, depthFog * 0.85);
          float alpha = clamp(intensity * (1.0 - depthFog * 0.55), 0.0, 0.92);

          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    gridGeometry = new THREE.PlaneGeometry(34, 62, 1, 1);
    gridGeometry.rotateX(-Math.PI / 2);
    gridMesh = new THREE.Mesh(gridGeometry, gridMaterial);
    gridMesh.position.set(0, -3.6, -12);
    gridMesh.rotation.set(-0.06, 0.24, 0.18);
    scene.add(gridMesh);

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
    const startTime = performance.now();
    const renderFrame = (time: number) => {
      if (disposed) return;

      if (time - lastFrame >= FRAME_INTERVAL) {
        lastFrame = time;
        const elapsed = (time - startTime) * 0.001;

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

        if (gridMaterial) {
          gridMaterial.uniforms.time.value = elapsed;
        }

        if (camera) {
          const targetX = pointer.x * 0.8;
          const targetY = -1.6 + pointer.y * 0.85;
          const targetZ = -8.6 + pointer.y * 0.4;
          camera.position.x += (pointer.x * 0.9 - camera.position.x) * 0.045;
          camera.position.y += ((1.1 + pointer.y * 0.7) - camera.position.y) * 0.05;
          camera.lookAt(targetX, targetY, targetZ);
        }

        if (gradientMesh) {
          gradientMesh.rotation.y += (pointer.x * 0.25 - gradientMesh.rotation.y) * 0.05;
          gradientMesh.rotation.x += (-0.24 + pointer.y * 0.35 - gradientMesh.rotation.x) * 0.05;
        }

        if (gridMesh) {
          const targetX = pointer.x * 1.6;
          const targetY = -3.6 + pointer.y * 0.8;
          gridMesh.position.x += (targetX - gridMesh.position.x) * 0.06;
          gridMesh.position.y += (targetY - gridMesh.position.y) * 0.06;
          gridMesh.rotation.y += (pointer.x * 0.4 - gridMesh.rotation.y) * 0.04;
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
      gridGeometry?.dispose();
      gridMaterial?.dispose();
      particleGeometry?.dispose();
      renderer?.dispose();
      setMode("idle");
    };
  }, [highEffects, theme]);

  return (
    <div
      ref={mountRef}
      className="hero-stage"
      data-mode={mode}
      data-high-effects={highEffects ? "on" : "off"}
      aria-hidden="true"
    >
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
