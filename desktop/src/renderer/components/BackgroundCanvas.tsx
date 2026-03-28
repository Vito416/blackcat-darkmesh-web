import React, { useEffect, useRef } from "react";
import * as THREE from "three";

type BackgroundCanvasProps = {
  active: boolean;
};

const FRAME_INTERVAL = 1000 / 30; // cap to ~30fps

const BackgroundCanvas: React.FC<BackgroundCanvasProps> = ({ active }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const mount = mountRef.current;
    const canvas = canvasRef.current;
    if (!mount || !canvas) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let grid: THREE.LineSegments | null = null;
    let aurora: THREE.Mesh | null = null;
    let auroraMaterial: THREE.ShaderMaterial | null = null;
    let raf = 0;
    let disposed = false;
    let lastFrame = 0;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: false,
        powerPreference: "low-power",
        preserveDrawingBuffer: false,
      });
    } catch {
      return;
    }

    const css = getComputedStyle(document.documentElement);
    const accent = css.getPropertyValue("--accent").trim() || "#2ff5ff";
    const accentStrong = css.getPropertyValue("--accent-strong").trim() || "#ff45e6";
    const bg = css.getPropertyValue("--bg").trim() || "#050910";

    const setSize = () => {
      const { clientWidth, clientHeight } = mount;
      renderer!.setSize(clientWidth, clientHeight, false);
      renderer!.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      if (camera) {
        camera.aspect = clientWidth / clientHeight;
        camera.updateProjectionMatrix();
      }
    };

    setSize();

    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(new THREE.Color(bg), 0.035);

    camera = new THREE.PerspectiveCamera(52, 1, 0.1, 200);
    camera.position.set(0, 10, 28);
    camera.lookAt(0, 0, 0);

    // Grid geometry (wireframe plane)
    const gridSize = 64;
    const step = 1.6;
    const points: number[] = [];
    for (let i = -gridSize; i <= gridSize; i += step) {
      points.push(-gridSize, 0, i, gridSize, 0, i); // lines parallel X
      points.push(i, 0, -gridSize, i, 0, gridSize); // lines parallel Z
    }
    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const gridMaterial = new THREE.LineBasicMaterial({
      color: new THREE.Color(accent),
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    grid = new THREE.LineSegments(gridGeometry, gridMaterial);
    grid.rotation.x = -0.4;
    grid.position.y = -6;
    scene.add(grid);

    // Aurora sheet
    const auroraGeometry = new THREE.PlaneGeometry(80, 60, 1, 1);
    auroraMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        time: { value: 0 },
        color1: { value: new THREE.Color(accent) },
        color2: { value: new THREE.Color(accentStrong) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float time;
        uniform vec3 color1;
        uniform vec3 color2;
        varying vec2 vUv;
        float noise(vec2 p){
          return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453);
        }
        void main() {
          float n = noise(vUv * 40.0 + time * 0.3);
          float wave = sin((vUv.y + time * 0.08) * 12.0) * 0.5 + 0.5;
          float alpha = smoothstep(0.05, 0.35, wave) * 0.35;
          vec3 tint = mix(color1, color2, wave * 0.6 + n * 0.25);
          gl_FragColor = vec4(tint, alpha);
        }
      `,
      blending: THREE.AdditiveBlending,
    });
    aurora = new THREE.Mesh(auroraGeometry, auroraMaterial);
    aurora.position.set(0, 6, -18);
    aurora.rotation.x = -0.3;
    scene.add(aurora);

    const resizeObserver = new ResizeObserver(setSize);
    resizeObserver.observe(mount);

    const renderFrame = (now: number) => {
      if (disposed || !renderer || !scene || !camera) return;
      if (now - lastFrame < FRAME_INTERVAL) {
        raf = requestAnimationFrame(renderFrame);
        return;
      }
      lastFrame = now;
      const t = now * 0.001;
      if (grid) {
        grid.position.z = (t * 4) % step;
      }
      if (auroraMaterial) {
        auroraMaterial.uniforms.time.value = t;
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(renderFrame);
    };

    raf = requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      renderer?.dispose();
      grid?.geometry.dispose();
      if (Array.isArray(grid?.material)) {
        grid?.material.forEach((m) => m.dispose());
      } else {
        grid?.material.dispose();
      }
      auroraGeometry.dispose();
      auroraMaterial?.dispose();
      scene?.clear();
    };
  }, [active]);

  if (!active) return null;

  return (
    <div className="background-canvas" ref={mountRef} aria-hidden>
      <canvas ref={canvasRef} />
    </div>
  );
};

export default BackgroundCanvas;
