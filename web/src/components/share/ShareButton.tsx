"use client";

import React from "react";
import { track } from "@vercel/analytics";
import { xIntentUrl, telegramIntentUrl } from "@/lib/share/intents";
import type { ShareLabels } from "@/lib/share/shareText";

const DEFAULT_LABELS: ShareLabels = {
  button: "Share",
  copy: "Copy link",
  copied: "Copied ✓",
  x: "Share on X",
  telegram: "Share on Telegram",
};

export function ShareButton({
  url,
  text,
  labels,
  meta,
}: {
  url: string;
  text: string;
  labels?: Partial<ShareLabels>;
  /** 不透明键值，原样并入 track payload（保持组件无业务知识）。如 { entity, entityType, lang } */
  meta?: Record<string, string>;
}): React.ReactElement {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // 打点：fire-and-forget，被 adblock 拦截/抛错绝不阻断分享。
  const fire = (event: string, method?: string) => {
    try {
      track(event, { ...(meta ?? {}), ...(method ? { method } : {}) });
    } catch {
      /* analytics blocked — ignore */
    }
  };

  const closeMenu = React.useCallback(() => setOpen(false), []);

  // 桌面菜单：点击外部 + Esc 关闭
  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeMenu]);

  const flashCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const copyLink = async () => {
    fire("share_click", "copy");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        legacyCopy(url);
      }
      fire("copy_link");
      flashCopied();
    } catch {
      legacyCopy(url);
      flashCopied();
    }
    closeMenu();
  };

  const onMainClick = async () => {
    // 能力检测在此（handler 内），不在 render，避免 SSR/CSR 标记不一致
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      fire("share_click", "native");
      try {
        await navigator.share({ text, url });
      } catch (err) {
        // 用户取消 → 非错误；其他错误 → 退回桌面菜单
        if ((err as Error)?.name !== "AbortError") setOpen(true);
      }
      return;
    }
    setOpen((v) => !v);
  };

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={onMainClick}
        aria-label={t.button}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--tt-border)] px-3 py-1.5 text-xs font-medium text-[var(--tt-muted)] transition-colors hover:bg-[var(--tt-panel)] hover:text-[var(--tt-text)]"
      >
        {t.button}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-2 w-44 overflow-hidden rounded-md border border-[var(--tt-border)] bg-[var(--tt-surface)] py-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={copyLink}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {copied ? t.copied : t.copy}
          </button>
          <a
            role="menuitem"
            href={xIntentUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fire("share_click", "x");
              closeMenu();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {t.x}
          </a>
          <a
            role="menuitem"
            href={telegramIntentUrl(text, url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              fire("share_click", "telegram");
              closeMenu();
            }}
            className="block w-full px-3 py-2 text-left text-sm text-[var(--tt-text)] hover:bg-[var(--tt-panel)]"
          >
            {t.telegram}
          </a>
        </div>
      )}

      <span aria-live="polite" className="sr-only">
        {copied ? t.copied : ""}
      </span>
    </div>
  );
}

// 兜底复制：clipboard API 不可用（非安全上下文/老浏览器）时用隐藏 textarea + execCommand。
function legacyCopy(value: string): void {
  const ta = document.createElement("textarea");
  ta.value = value;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
  } catch {
    /* 最后兜底：保留选中，用户手动复制 */
  }
  document.body.removeChild(ta);
}
