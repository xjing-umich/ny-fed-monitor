"use client";
import { useEffect, useRef } from "react";

export default function RevealStagger({
  children,
  stepMs = 60,
  delayMs = 0,
  className,
}: {
  children: React.ReactNode;
  stepMs?: number;
  delayMs?: number;
  className?: string;
}): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    kids.forEach((k) => {
      k.style.opacity = "0";
      k.style.transform = "translateY(10px)";
      k.style.transition = "opacity var(--tt-dur) var(--tt-ease), transform var(--tt-dur) var(--tt-ease)";
    });
    const timers: number[] = [];
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        kids.forEach((k, i) => {
          timers.push(
            window.setTimeout(() => {
              k.style.opacity = "1";
              k.style.transform = "translateY(0)";
            }, delayMs + i * stepMs),
          );
        });
        io.disconnect();
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, [stepMs, delayMs]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
