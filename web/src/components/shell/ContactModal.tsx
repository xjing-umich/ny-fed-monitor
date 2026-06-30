"use client";

import React, { useEffect, useState } from "react";
import { Mail, X } from "lucide-react";
import type { Lang } from "@/lib/nav";

type Status = "idle" | "sending" | "ok" | "error";

interface ContactModalProps {
  lang: Lang;
}

const t = (lang: Lang) =>
  lang === "zh"
    ? {
        link: "联系我们",
        title: "联系我们",
        subtitle: "有问题、反馈或合作意向?给我们留言,我们会尽快回复。",
        name: "称呼(可选)",
        email: "你的邮箱",
        message: "留言",
        send: "发送",
        sending: "发送中…",
        ok: "已收到,谢谢!我们会通过你填写的邮箱回复。",
        error: "发送失败,请稍后再试。",
        close: "关闭",
      }
    : {
        link: "Contact Us",
        title: "Contact Us",
        subtitle: "Questions, feedback, or partnership ideas? Drop us a note and we'll get back to you.",
        name: "Name (optional)",
        email: "Your email",
        message: "Message",
        send: "Send",
        sending: "Sending…",
        ok: "Got it, thanks! We'll reply to the email you provided.",
        error: "Failed to send. Please try again later.",
        close: "Close",
      };

export default function ContactModal({ lang }: ContactModalProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const c = t(lang);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  function close() {
    setOpen(false);
    // Reset after the panel is hidden so the user doesn't see it flip.
    setTimeout(() => {
      setStatus("idle");
      setErrorMsg("");
    }, 200);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setStatus("sending");
    setErrorMsg("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          message: data.get("message"),
          company: data.get("company"), // honeypot
        }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStatus("ok");
        form.reset();
      } else {
        setStatus("error");
        setErrorMsg(typeof json.error === "string" ? json.error : c.error);
      }
    } catch {
      setStatus("error");
      setErrorMsg(c.error);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 self-start text-sm text-[var(--tt-muted)] hover:text-[var(--tt-text)] transition-colors"
      >
        <Mail size={13} />
        {c.link}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={c.title}
            className="w-full max-w-md rounded-md bg-[var(--tt-panel)] border border-[var(--tt-border)] shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            <div className="flex items-start justify-between px-5 pt-5 pb-3 border-b border-[var(--tt-border)]">
              <div>
                <h2 className="font-display text-lg font-medium text-[var(--tt-text)]">
                  {c.title}
                </h2>
                <p className="mt-1 text-xs text-[var(--tt-muted)] leading-relaxed">
                  {c.subtitle}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label={c.close}
                className="shrink-0 flex items-center justify-center w-7 h-7 rounded-md text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {status === "ok" ? (
              <div className="px-5 py-8 text-center">
                <p className="text-sm text-[var(--tt-text)]">{c.ok}</p>
                <button
                  type="button"
                  onClick={close}
                  className="mt-5 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-[var(--tt-accent)] text-white hover:opacity-90 transition-opacity"
                >
                  {c.close}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-5 py-4 flex flex-col gap-3">
                {/* Honeypot — hidden from humans, visible to bots */}
                <input
                  type="text"
                  name="company"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  className="hidden"
                />

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--tt-muted)]">{c.name}</span>
                  <input
                    type="text"
                    name="name"
                    maxLength={200}
                    className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-bg)] px-3 py-2 text-sm text-[var(--tt-text)] focus:border-[var(--tt-accent)] transition-colors"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--tt-muted)]">{c.email}</span>
                  <input
                    type="email"
                    name="email"
                    required
                    maxLength={200}
                    className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-bg)] px-3 py-2 text-sm text-[var(--tt-text)] focus:border-[var(--tt-accent)] transition-colors"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs text-[var(--tt-muted)]">{c.message}</span>
                  <textarea
                    name="message"
                    required
                    rows={4}
                    maxLength={5000}
                    className="resize-none rounded-md border border-[var(--tt-border)] bg-[var(--tt-bg)] px-3 py-2 text-sm text-[var(--tt-text)] focus:border-[var(--tt-accent)] transition-colors"
                  />
                </label>

                {status === "error" && (
                  <p className="text-xs text-[var(--tt-negative)]">{errorMsg || c.error}</p>
                )}

                <button
                  type="submit"
                  disabled={status === "sending"}
                  className="mt-1 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-[var(--tt-accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-60"
                >
                  {status === "sending" ? c.sending : c.send}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
