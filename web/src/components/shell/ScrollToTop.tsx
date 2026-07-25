"use client";

import React from "react";
import { ArrowUp } from "lucide-react";

export default function ScrollToTop({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={label}
      className="inline-flex items-center justify-center w-11 h-11 sm:w-8 sm:h-8 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
    >
      <ArrowUp size={15} />
    </button>
  );
}
