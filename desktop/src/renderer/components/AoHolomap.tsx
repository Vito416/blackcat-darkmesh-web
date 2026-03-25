import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

import type { HealthStatus, HealthStatusSummary } from "../services/health";

// Small helper to avoid repeated color lookups from CSS.
const readCssVar = (token: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const averageLatency = (item?: HealthStatus): number | null => {
  if (!item) return null;
  if (item.latencyHistory?.length) {
    const sum = item.latencyHistory.reduce((acc, v) => acc + v, 0);
    return Math.round(sum / item.latencyHistory.length);
  }
  if (typeof item.latencyMs === "number") return Math.round(item.latencyMs);
  return null;
};

const formatLatency = (value: number | null) => (value == null ? "—" : `${value} ms`);

const statusLabel = (status: HealthStatus["status"]) => {
  switch (status) {
    case "ok":
      return "OK";
    case "warn":
      return "Warn";
    case "error":
      return "Error";
    case "offline":
      return "Offline";
    case "missing":
      return "Missing";
    default:
      return status;
  }
};

const severityRank: Record<HealthStatus["status"] | "unknown", number> = {
  ok: 1,
  warn: 2,
  missing: 3,
  offline: 3,
  error: 4,
  unknown: 2,
};

const statusWeight = (status: HealthStatus["status"] | "unknown") => {
  switch (status) {
    case "ok":
      return 1;
    case "warn":
      return 0.75;
    case "missing":
    case "offline":
      return 0.45;
    case "error":
      return 0.2;
    default:
      return 0.6;
  }
};

const statusColor = (status: HealthStatus["status"] | "unknown", palette: Palette) => {
  switch (status) {
    case "ok":
      return palette.strong;
    case "warn":
      return palette.warn;
    case "error":
      return palette.error;
    case "offline":
    case "missing":
      return palette.muted;
    default:
      return palette.accent;
  }
};

const FLOW_PARTICLES = 88;
const BURST_DURATION_MS = 2600;

const NODE_LAYOUT = [
  { id: "gateway" as const, label: "Gateway", position: new THREE.Vector3(-2.7, 0.25, -0.5) },
  { id: "worker" as const, label: "Worker", position: new THREE.Vector3(0, -0.1, 0.35) },
  { id: "ao" as const, label: "AO", position: new THREE.Vector3(2.7, 0.25, -0.4) },
];

type Palette = {
  accent: string;
  strong: string;
  warn: string;
  error: string;
  muted: string;
  surface: string;
  grid: string;
};

type Burst = {
  flow: 0 | 1;
  createdAt: number;
  color: string;
};

type Flow = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  geometry: THREE.BufferGeometry;
  material: THREE.PointsMaterial;
  progress: Float32Array;
  speed: Float32Array;
  jitter: Float32Array;
  points: THREE.Points;
};

type NodeVisual = {
  id: "gateway" | "worker" | "ao";
  label: string;
  mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
};

type AoHolomapProps = {
  enabled: boolean;
  reducedMotion: boolean;
  theme: "light" | "cyberpunk";
  health: HealthStatus[];
  summary: HealthStatusSummary;
  events: Array<{ kind: "deploy" | "spawn"; id: string | null; status: string; time: string }>;
};

const AoHolomap: React.FC<AoHolomapProps> = ({ enabled, reducedMotion, theme, health, summary, events }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const healthRef = useRef<HealthStatus[]>(health);
  const burstsRef = useRef<Burst[]>([]);
  const lastEventKeyRef = useRef<string | null>(null);
  const [mode, setMode] = useState<"paused" | "webgl" | "fallback">("paused");

  healthRef.current = health;

  const palette = useMemo<Palette>(() => {
    const accent = readCssVar("--accent", "#0ea5e9");
    const strong = readCssVar("--accent-strong", "#22c55e");
    const warn = readCssVar("--warn", "#d97706");
    return {
      accent,
      strong,
      warn,
      error: "#ef4444",
      muted: readCssVar("--ink-muted", "#94a3b8"),
      surface: readCssVar("--surface-muted", "#0f172a"),
      grid: readCssVar("--border", "#1f2937"),
    };
  }, [theme]);

  useEffect(() => {
    const latest = events[0];
    if (!latest) return;
    const key = `${latest.kind}-${latest.time}-${latest.id ?? "none"}`;
    if (key === lastEventKeyRef.current) return;
    lastEventKeyRef.current = key;

    const flowIndex: 0 | 1 = latest.kind === "deploy" ? 0 : 1;
    const burst: Burst = {
      flow: flowIndex,
      createdAt: performance.now(),
      color: latest.kind === "deploy" ? palette.accent : palette.strong,
    };
    burstsRef.current = [...burstsRef.current.slice(-5), burst];
  }, [events, palette.accent, palette.strong]);

  useEffect(() => {
    if (!enabled || reducedMotion) {
      setMode("paused");
      return;
    }

    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer | null = null;
    let scene: THREE.Scene | null = null;
    let camera: THREE.PerspectiveCamera | null = null;
    let flows: Flow[] = [];
    let nodes: NodeVisual[] = [];
    let frame = 0;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch (err) {
      console.error("Holomap renderer failed", err);
      setMode("fallback");
      return;
    }

    setMode("webgl");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    mount.appendChild(renderer.domElement);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(46, 1, 0.1, 100);
    camera.position.set(0, 1.2, 6.4);
    camera.lookAt(0, 0.1, 0);

    const accentColor = new THREE.Color(palette.accent);
    const strongColor = new THREE.Color(palette.strong);
    const mutedColor = new THREE.Color(palette.muted);
    const surfaceColor = new THREE.Color(palette.surface);

    const ambient = new THREE.AmbientLight(mutedColor, 0.7);
    const keyLight = new THREE.PointLight(accentColor, 1.1, 14, 2);
    keyLight.position.set(-2.6, 2.8, 3.8);
    const rimLight = new THREE.PointLight(strongColor, 0.9, 12, 2);
    rimLight.position.set(3.2, 2.4, -3.2);
    scene.add(ambient, keyLight, rimLight);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6.8, 64),
      new THREE.MeshBasicMaterial({ color: surfaceColor, transparent: true, opacity: 0.2 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.08;
    scene.add(ground);

    const gridMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(palette.grid), transparent: true, opacity: 0.2 });
    const ringGeo = new THREE.RingGeometry(2.3, 2.32, 72);
    const ring = new THREE.LineLoop(ringGeo, gridMaterial);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.92;
    scene.add(ring);

    const group = new THREE.Group();
    scene.add(group);

    nodes = NODE_LAYOUT.map(({ id, label, position }) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 28, 28),
        new THREE.MeshStandardMaterial({
          color: mutedColor,
          roughness: 0.32,
          metalness: 0.35,
          emissive: mutedColor.clone().multiplyScalar(0.25),
          emissiveIntensity: 0.7,
        }),
      );
      mesh.position.copy(position);

      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.4, 0.54, 40),
        new THREE.MeshBasicMaterial({ color: mutedColor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.set(position.x, position.y - 0.2, position.z);

      group.add(mesh);
      group.add(ringMesh);

      return { id, label, mesh, ring: ringMesh };
    });

    flows = [
      { from: NODE_LAYOUT[0].position.clone(), to: NODE_LAYOUT[1].position.clone() },
      { from: NODE_LAYOUT[1].position.clone(), to: NODE_LAYOUT[2].position.clone() },
    ].map((flow) => {
      const geometry = new THREE.BufferGeometry();
      const progress = new Float32Array(FLOW_PARTICLES);
      const speed = new Float32Array(FLOW_PARTICLES);
      const jitter = new Float32Array(FLOW_PARTICLES);
      const positions = new Float32Array(FLOW_PARTICLES * 3);

      for (let i = 0; i < FLOW_PARTICLES; i += 1) {
        progress[i] = Math.random();
        speed[i] = 0.35 + Math.random() * 0.9;
        jitter[i] = (Math.random() - 0.5) * 0.5;
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("progress", new THREE.BufferAttribute(progress, 1));
      geometry.setAttribute("speed", new THREE.BufferAttribute(speed, 1));
      geometry.setAttribute("jitter", new THREE.BufferAttribute(jitter, 1));

      const material = new THREE.PointsMaterial({
        color: accentColor,
        size: 0.085,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      });

      const points = new THREE.Points(geometry, material);
      points.position.y = -0.02;
      group.add(points);

      return { ...flow, geometry, material, progress, speed, jitter, points } as Flow;
    });

    const resize = () => {
      if (!renderer || !camera || !mount) return;
      const width = mount.clientWidth || 640;
      const height = Math.max(300, Math.round(width * 0.48));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    resize();

    const tempColor = new THREE.Color();
    const tempEmissive = new THREE.Color();
    const tempBurst = new THREE.Color();
    let lastTime = performance.now();

    const animate = (time: number) => {
      const delta = clamp((time - lastTime) / 1000, 0.0001, 0.04);
      lastTime = time;

      burstsRef.current = burstsRef.current.filter((burst) => time - burst.createdAt < BURST_DURATION_MS);

      const healthSnapshot = healthRef.current;

      nodes.forEach((node) => {
        const status = healthSnapshot.find((item) => item.id === node.id)?.status ?? "missing";
        const targetColor = tempColor.set(statusColor(status, palette));
        const material = node.mesh.material;
        material.color.lerp(targetColor, 0.14);
        material.emissive.lerp(tempEmissive.copy(targetColor).multiplyScalar(0.4), 0.12);
        const ringMaterial = node.ring.material;
        ringMaterial.color.lerp(targetColor, 0.12);
        ringMaterial.opacity = 0.32 + statusWeight(status) * 0.5;
        const scale = 0.94 + statusWeight(status) * 0.12;
        node.mesh.scale.setScalar(scale);
      });

      flows.forEach((flow, index) => {
        const fromStatus = healthSnapshot.find((item) => item.id === NODE_LAYOUT[index].id)?.status ?? "unknown";
        const toStatus = healthSnapshot.find((item) => item.id === NODE_LAYOUT[index + 1].id)?.status ?? "unknown";
        const dominant = severityRank[fromStatus] >= severityRank[toStatus] ? fromStatus : toStatus;
        const severity = Math.min(statusWeight(fromStatus), statusWeight(toStatus));

        const burst = burstsRef.current.find((entry) => entry.flow === index);
        const burstPhase = burst ? 1 - clamp((time - burst.createdAt) / BURST_DURATION_MS, 0, 1) : 0;
        const speedBoost = 1 + burstPhase * 0.8;

        const posAttr = flow.geometry.getAttribute("position") as THREE.BufferAttribute;
        const progAttr = flow.geometry.getAttribute("progress") as THREE.BufferAttribute;
        const speedAttr = flow.geometry.getAttribute("speed") as THREE.BufferAttribute;
        const jitterAttr = flow.geometry.getAttribute("jitter") as THREE.BufferAttribute;
        const count = progAttr.count;

        const dx = flow.to.x - flow.from.x;
        const dy = flow.to.y - flow.from.y;
        const dz = flow.to.z - flow.from.z;

        for (let i = 0; i < count; i += 1) {
          let progress = progAttr.getX(i) + speedAttr.getX(i) * delta * (0.4 + severity) * speedBoost;
          if (progress > 1) progress -= 1;
          progAttr.setX(i, progress);
          const eased = progress * progress * (3 - 2 * progress);
          const jitter = jitterAttr.getX(i);
          posAttr.setXYZ(
            i,
            flow.from.x + dx * eased + jitter * 0.16,
            flow.from.y + dy * eased + Math.sin((progress + i * 0.14) * Math.PI * 2) * 0.12,
            flow.from.z + dz * eased + jitter * 0.22,
          );
        }

        progAttr.needsUpdate = true;
        posAttr.needsUpdate = true;

        const targetColor = tempColor.set(statusColor(dominant, palette));
        if (burst) {
          targetColor.lerp(tempBurst.set(burst.color), 0.6 * burstPhase + 0.2);
        }

        flow.material.color.lerp(targetColor, 0.12);
        flow.material.opacity = clamp(0.28 + severity * 0.55 + burstPhase * 0.2, 0.22, 0.92);
        flow.material.size = 0.08 + (0.06 + burstPhase * 0.06) * severity;
      });

      group.rotation.y = 0.16 + Math.sin(time * 0.00022) * 0.04;
      group.rotation.x = -0.08 + Math.sin(time * 0.00017) * 0.02;

      renderer?.render(scene as THREE.Scene, camera as THREE.PerspectiveCamera);
      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    window.addEventListener("resize", resize, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      flows.forEach((flow) => {
        flow.geometry.dispose();
        flow.material.dispose();
      });
      nodes.forEach((node) => {
        node.mesh.geometry.dispose();
        node.mesh.material.dispose();
        node.ring.geometry.dispose();
        node.ring.material.dispose();
      });
      scene?.clear();
      renderer?.dispose();
      renderer?.domElement.remove();
      setMode("paused");
    };
  }, [enabled, palette, reducedMotion]);

  const nodeStatuses = useMemo(
    () =>
      NODE_LAYOUT.map((node) => {
        const record = health.find((item) => item.id === node.id);
        return {
          id: node.id,
          label: node.label,
          status: record?.status ?? "missing",
          latency: averageLatency(record),
        };
      }),
    [health],
  );

  const latestEvents = useMemo(
    () =>
      events.slice(0, 3).map((entry) => ({
        ...entry,
        label: entry.kind === "deploy" ? "Deploy" : "Spawn",
        at: new Date(entry.time).toLocaleTimeString([], { hour12: false }),
      })),
    [events],
  );

  const overallCopy = summary.overall === "ok" ? "Network nominal" : `${summary.overall.toUpperCase()} · ${summary.ok} OK / ${summary.warn} warn / ${summary.error} error`;

  const holomapMode = !enabled || reducedMotion ? "paused" : mode;

  return (
    <div className={`ao-holomap-shell mode-${holomapMode}`}>
      <div className="ao-holomap-stage" ref={mountRef}>
        {holomapMode !== "webgl" && (
          <div className="ao-holomap-fallback" aria-live="polite">
            <div className="ao-holomap-fallback-grid" />
            <div className="ao-holomap-fallback-body">
              <p className="eyebrow">Holomap</p>
              <h4>{reducedMotion ? "Reduced motion active" : "High effects paused"}</h4>
              <p className="subtle">Showing a static pipeline. Toggle high effects to animate.</p>
            </div>
          </div>
        )}
        <div className="ao-holomap-overlay">
          <div className="ao-holomap-status">
            <span className={`pill ${summary.overall === "ok" ? "accent" : summary.overall === "warn" ? "warn" : "issue"}`}>
              {overallCopy}
            </span>
            <span className="pill ghost">{latestEvents[0] ? `${latestEvents[0].label} ${latestEvents[0].status}` : "Waiting for AO activity"}</span>
          </div>
          <div className="ao-holomap-event-stack">
            {latestEvents.map((entry, idx) => (
              <div key={`${entry.kind}-${entry.time}-${idx}`} className="ao-holomap-event">
                <span className={`mini-log-kind ${entry.kind}`}>{entry.label}</span>
                <span className="mono">{entry.id ?? "—"}</span>
                <span className="badge ghost">{entry.at}</span>
                <span className={`mini-log-status ${entry.status.toLowerCase()}`}>{entry.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="ao-holomap-legend">
        <div className="ao-holomap-nodes">
          {nodeStatuses.map((node) => (
            <div key={node.id} className="ao-holomap-node">
              <div className="ao-holomap-node-head">
                <span className={`mini-log-kind ${node.id === "ao" ? "spawn" : "deploy"}`}>{node.label}</span>
                <span className={`mini-log-status ${node.status.toLowerCase()}`}>{statusLabel(node.status)}</span>
              </div>
              <p className="mono subtle">{formatLatency(node.latency)} avg</p>
            </div>
          ))}
        </div>
        <div className="ao-holomap-meter" aria-hidden>
          <div className="ao-holomap-meter-fill" style={{ width: `${clamp((summary.ok / Math.max(summary.total, 1)) * 100, 0, 100)}%` }} />
        </div>
      </div>
    </div>
  );
};

export default AoHolomap;
