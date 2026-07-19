"use client";

import { useEffect, useState } from "react";

/** true when viewport ≥ md (768px). SSR/first paint defaults false (mobile-prefix slice). */
export function useMediaQueryMd(): boolean {
  const [isMd, setIsMd] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsMd(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return isMd;
}
