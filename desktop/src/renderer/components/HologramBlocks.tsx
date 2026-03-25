import React, { useEffect, useMemo, useRef } from "react";

type HologramBlocksProps = {
  active: boolean;
  hostRef: React.RefObject<HTMLElement>;
  prefersReducedMotion: boolean;
};

type BlockConfig = {
  id: string;
  x: number;
  y: number;
  depth: number;
  scale: number;
  rotate: number;
  delay: number;
};

const BLOCK_COUNT = 8;

const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

const buildBlocks = (): BlockConfig[] =>
  Array.from({ length: BLOCK_COUNT }, (_, index) => ({
    id: `holo-${index}`,
    x: randomInRange(6, 88),
    y: randomInRange(8, 86),
    depth: randomInRange(-94, -46),
    scale: randomInRange(0.72, 1.22),
    rotate: randomInRange(-14, 18),
    delay: randomInRange(0, 3.6),
  }));

const HologramBlocks: React.FC<HologramBlocksProps> = ({ active, hostRef, prefersReducedMotion }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => buildBlocks(), []);
  const rafRef = useRef<number>(0);
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    node.style.setProperty("--holo-tilt-x", "0deg");
    node.style.setProperty("--holo-tilt-y", "0deg");
    node.style.setProperty("--holo-parallax-x", "0px");
    node.style.setProperty("--holo-parallax-y", "0px");
  }, []);

  useEffect(() => {
    if (!active || prefersReducedMotion) return undefined;

    const host = hostRef.current;
    const layer = containerRef.current;
    if (!host || !layer) return undefined;

    const applyParallax = () => {
      rafRef.current = 0;
      const { x, y } = targetRef.current;
      const clampedX = Math.max(-0.6, Math.min(0.6, x));
      const clampedY = Math.max(-0.6, Math.min(0.6, y));
      layer.style.setProperty("--holo-tilt-x", `${(clampedX * 12).toFixed(3)}deg`);
      layer.style.setProperty("--holo-tilt-y", `${(clampedY * -10).toFixed(3)}deg`);
      layer.style.setProperty("--holo-parallax-x", `${(clampedX * 18).toFixed(2)}px`);
      layer.style.setProperty("--holo-parallax-y", `${(clampedY * 16).toFixed(2)}px`);
    };

    const handlePointerMove = (event: PointerEvent) => {
      const rect = host.getBoundingClientRect();
      const x = rect.width ? (event.clientX - rect.left) / rect.width - 0.5 : 0;
      const y = rect.height ? (event.clientY - rect.top) / rect.height - 0.5 : 0;
      targetRef.current = { x, y };
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(applyParallax);
      }
    };

    const reset = () => {
      targetRef.current = { x: 0, y: 0 };
      layer.style.setProperty("--holo-tilt-x", "0deg");
      layer.style.setProperty("--holo-tilt-y", "0deg");
      layer.style.setProperty("--holo-parallax-x", "0px");
      layer.style.setProperty("--holo-parallax-y", "0px");
    };

    host.addEventListener("pointermove", handlePointerMove, { passive: true });
    host.addEventListener("pointerleave", reset);

    return () => {
      host.removeEventListener("pointermove", handlePointerMove);
      host.removeEventListener("pointerleave", reset);
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [active, hostRef, prefersReducedMotion]);

  if (!active || prefersReducedMotion) return null;

  return (
    <div ref={containerRef} className="hologram-blocks" aria-hidden>
      {blocks.map((block) => (
        <div
          key={block.id}
          className="hologram-block"
          style={
            {
              "--holo-x": `${block.x}%`,
              "--holo-y": `${block.y}%`,
              "--holo-depth": `${block.depth}px`,
              "--holo-scale": block.scale,
              "--holo-rotate": `${block.rotate}deg`,
              "--holo-delay": `${block.delay}s`,
            } as React.CSSProperties
          }
        >
          <span className="hologram-block-sheen" />
        </div>
      ))}
    </div>
  );
};

export default HologramBlocks;
