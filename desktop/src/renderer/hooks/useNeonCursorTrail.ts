import { useEffect, useRef } from "react";

/**
 * Lightweight cursor trail. Spawns short-lived neon particles on pointer move/press.
 * Caller is expected to gate `enabled` with prefers-reduced-motion checks.
 */
const MAX_PARTICLES = 32;
const MIN_INTERVAL_MS = 18;

const makeLayer = () => {
  const layer = document.createElement("div");
  layer.className = "cursor-trail-layer";
  return layer;
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;

export const useNeonCursorTrail = (enabled: boolean) => {
  const layerRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<HTMLSpanElement[]>([]);
  const lastSpawnRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const layer = makeLayer();
    document.body.appendChild(layer);
    layerRef.current = layer;

    const spawn = (x: number, y: number, boost = 0) => {
      const host = layerRef.current;
      if (!host) return;

      const particle = document.createElement("span");
      particle.className = "cursor-trail-particle";
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--trail-size", `${Math.round(randomBetween(10, 18) + boost * 4)}px`);
      particle.style.setProperty("--trail-rotation", `${randomBetween(-16, 16)}deg`);
      particle.style.setProperty("--trail-hue", `${Math.round(randomBetween(170, 210))}deg`);

      host.appendChild(particle);
      particlesRef.current.push(particle);

      while (particlesRef.current.length > MAX_PARTICLES) {
        const oldest = particlesRef.current.shift();
        oldest?.remove();
      }

      window.setTimeout(() => particle.remove(), 700);
    };

    const handleMove = (event: PointerEvent) => {
      const now = performance.now();
      if (now - lastSpawnRef.current < MIN_INTERVAL_MS) return;
      lastSpawnRef.current = now;
      spawn(event.clientX, event.clientY, 0);
    };

    const handlePress = (event: PointerEvent) => {
      spawn(event.clientX, event.clientY, 1);
    };

    window.addEventListener("pointermove", handleMove, { passive: true });
    window.addEventListener("pointerdown", handlePress, { passive: true });
    window.addEventListener("pointerenter", handleMove, { passive: true });

    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerdown", handlePress);
      window.removeEventListener("pointerenter", handleMove);
      particlesRef.current.forEach((particle) => particle.remove());
      particlesRef.current = [];
      layer.remove();
      layerRef.current = null;
    };
  }, [enabled]);
};

export default useNeonCursorTrail;
