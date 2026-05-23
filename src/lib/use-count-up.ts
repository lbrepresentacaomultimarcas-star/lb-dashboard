"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anima um número de 0 (ou valor anterior) até `target` com easeOutCubic.
 * Usa requestAnimationFrame — leve, sem dependência externa.
 */
export function useCountUp(target: number, durationMs = 900): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return val;
}
