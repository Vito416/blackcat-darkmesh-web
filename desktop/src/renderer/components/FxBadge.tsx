import React, { useEffect, useRef } from "react";
import type { AnimationItem } from "lottie-web";

type FxBadgeProps = {
  active: boolean;
  reducedMotion: boolean;
  label?: string;
};

const fxPulseAnimation = {
  v: "5.9.0",
  fr: 30,
  ip: 0,
  op: 60,
  w: 64,
  h: 64,
  nm: "fx-pulse",
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: "Ring",
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [32, 32, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            {
              i: { x: [0.42, 0.42, 0.42], y: [0, 0, 0] },
              o: { x: [0.58, 0.58, 0.58], y: [1, 1, 1] },
              t: 0,
              s: [60, 60, 100],
              e: [110, 110, 100],
            },
            {
              i: { x: [0.42, 0.42, 0.42], y: [0, 0, 0] },
              o: { x: [0.58, 0.58, 0.58], y: [1, 1, 1] },
              t: 30,
              s: [110, 110, 100],
              e: [60, 60, 100],
            },
            { t: 60 },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [46, 46] }, nm: "Ellipse Path 1" },
            { ty: "st", c: { a: 0, k: [0, 0.84, 1, 1] }, o: { a: 0, k: 100 }, w: { a: 0, k: 3 }, lc: 2, lj: 2, ml: 4, nm: "Stroke 1" },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
              nm: "Transform",
            },
          ],
          nm: "Ring Shape",
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
    {
      ddd: 0,
      ind: 2,
      ty: 4,
      nm: "Core",
      sr: 1,
      ks: {
        o: {
          a: 1,
          k: [
            { t: 0, s: [0], e: [100], i: { x: [0.42], y: [0] }, o: { x: [0.58], y: [1] } },
            { t: 20, s: [100], e: [15], i: { x: [0.42], y: [0] }, o: { x: [0.58], y: [1] } },
            { t: 40, s: [15], e: [0], i: { x: [0.42], y: [0] }, o: { x: [0.58], y: [1] } },
            { t: 60 },
          ],
        },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [32, 32, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            {
              t: 0,
              s: [40, 40, 100],
              e: [70, 70, 100],
              i: { x: [0.42, 0.42, 0.42], y: [0, 0, 0] },
              o: { x: [0.58, 0.58, 0.58], y: [1, 1, 1] },
            },
            {
              t: 24,
              s: [70, 70, 100],
              e: [40, 40, 100],
              i: { x: [0.42, 0.42, 0.42], y: [0, 0, 0] },
              o: { x: [0.58, 0.58, 0.58], y: [1, 1, 1] },
            },
            { t: 60 },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: "gr",
          it: [
            { ty: "el", p: { a: 0, k: [0, 0] }, s: { a: 0, k: [18, 18] }, nm: "Ellipse Path 1" },
            { ty: "fl", c: { a: 0, k: [0.22, 1, 0.75, 1] }, o: { a: 0, k: 100 }, r: 1, nm: "Fill 1" },
            {
              ty: "tr",
              p: { a: 0, k: [0, 0] },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
              nm: "Transform",
            },
          ],
          nm: "Core Shape",
        },
      ],
      ip: 0,
      op: 60,
      st: 0,
      bm: 0,
    },
  ],
} as const;

const FxBadge: React.FC<FxBadgeProps> = ({ active, reducedMotion, label = "FX" }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<AnimationItem | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    let mounted = true;

    const load = async () => {
      const lottie = (await import("lottie-web")).default;
      if (!mounted || !containerRef.current) return;
      animationRef.current?.destroy();
      animationRef.current = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop: true,
        autoplay: active,
        animationData: fxPulseAnimation,
        rendererSettings: { preserveAspectRatio: "xMidYMid slice", className: "fx-lottie" },
      });
      if (!active && animationRef.current) {
        animationRef.current.goToAndStop(0, true);
      }
    };

    void load();
    return () => {
      mounted = false;
      animationRef.current?.destroy();
      animationRef.current = null;
    };
  }, [active, reducedMotion]);

  useEffect(() => {
    if (!animationRef.current) return;
    if (active) {
      animationRef.current.play();
    } else {
      animationRef.current.goToAndStop(0, true);
    }
  }, [active]);

  useEffect(() => {
    if (reducedMotion || !containerRef.current) return;
    let ctx: { revert?: () => void } | null = null;

    void import("gsap").then(({ gsap }) => {
      if (!containerRef.current || reducedMotion) return;
      ctx = gsap.context(() => {
        gsap.fromTo(
          containerRef.current,
          { scale: 0.96, rotate: -3 },
          { scale: 1, rotate: 0, duration: 0.32, ease: "power2.out" },
        );
      }, containerRef);
    });

    return () => ctx?.revert?.();
  }, [active, reducedMotion]);

  return (
    <div className={`fx-badge ${active ? "on" : "off"} ${reducedMotion ? "static" : ""}`} aria-hidden>
      <div className="fx-badge-visual" ref={containerRef} />
      <span className="fx-badge-label">{label}</span>
    </div>
  );
};

export default FxBadge;
