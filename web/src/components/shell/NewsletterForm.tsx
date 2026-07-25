"use client";

import React, { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { track } from "@vercel/analytics";
import type { Lang } from "@/lib/nav";
import { footerCopy } from "@/lib/footer";

type Status = "idle" | "sending" | "ok" | "error";

export default function NewsletterForm({ lang, source = "footer" }: { lang: Lang; source?: string }) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const c = footerCopy(lang);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          company: data.get("company"), // honeypot
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("ok");
        form.reset();
        try {
          track("newsletter_subscribe", { source, lang });
        } catch {
          /* analytics blocked — ignore */
        }
      } else {
        setStatus("error");
        setErrorMsg(typeof json.error === "string" ? json.error : c.subscribeError);
      }
    } catch {
      setStatus("error");
      setErrorMsg(c.subscribeError);
    }
  }

  if (status === "ok") {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--tt-accent)]">
        <Check size={14} />
        {c.subscribed}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      {/* Honeypot */}
      <input
        type="text"
        name="company"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <div className="flex items-center gap-2">
        <input
          type="email"
          name="email"
          required
          maxLength={200}
          placeholder={c.emailPlaceholder}
          aria-label={c.emailPlaceholder}
          className="flex-1 min-w-0 rounded-md border border-[var(--tt-border)] bg-[var(--tt-bg)] px-3 py-2 text-sm text-[var(--tt-text)] focus:border-[var(--tt-accent)] transition-colors"
        />
        <button
          type="submit"
          disabled={status === "sending"}
          aria-label={c.subscribe}
          className="shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-md px-3 py-2 text-sm font-medium bg-[var(--tt-accent)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {status === "sending" ? (
            c.subscribing
          ) : (
            <>
              <span className="hidden sm:inline">{c.subscribe}</span>
              <ArrowRight size={14} className="sm:hidden" />
            </>
          )}
        </button>
      </div>
      {status === "error" && (
        <p className="text-xs text-[var(--tt-negative)]">{errorMsg || c.subscribeError}</p>
      )}
    </form>
  );
}
