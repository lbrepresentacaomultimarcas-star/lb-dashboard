"use client";

import { useEffect, useRef } from "react";

/** Chuva de confete em tela cheia (sem biblioteca). */
export function Confete({ onFim, duracao = 5000 }: { onFim?: () => void; duracao?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  // a animação não reinicia quando o componente pai re-renderiza
  const fimRef = useRef(onFim);
  useEffect(() => {
    fimRef.current = onFim;
  }, [onFim]);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const reduzir = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    c.width = window.innerWidth;
    c.height = window.innerHeight;
    const cores = ["#C9A227", "#e8c95a", "#22c55e", "#ef4444", "#38bdf8", "#ffffff", "#a78bfa"];
    const pecas = Array.from({ length: reduzir ? 40 : 180 }, () => ({
      x: Math.random() * c.width,
      y: -20 - Math.random() * c.height,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 10,
      vy: 2 + Math.random() * 4,
      vx: -1.5 + Math.random() * 3,
      r: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      cor: cores[Math.floor(Math.random() * cores.length)],
    }));
    const inicio = performance.now();
    let raf = 0;
    const passo = (t: number) => {
      ctx.clearRect(0, 0, c.width, c.height);
      for (const p of pecas) {
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        if (p.y > c.height + 20 && t - inicio < duracao - 1500) p.y = -20;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.cor;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (t - inicio < duracao) raf = requestAnimationFrame(passo);
      else fimRef.current?.();
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [duracao]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[300]" />;
}
