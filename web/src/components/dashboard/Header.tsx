"use client";

import React, { useTransition } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, RefreshCw } from "lucide-react";
import type { Summary } from "@/lib/types";

type Lang = "zh" | "en";

function formatAsOf(asOf: string): string {
  if (!asOf) return "--:--";
  try {
    const d = new Date(asOf);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return asOf.slice(11, 16) || asOf;
  }
}

function FreshnessPill({ summary }: { summary: Summary }) {
  const isFullyLive =
    summary.live_sections.length > 0 &&
    summary.unavailable_sections.length === 0 &&
    summary.live_sections.length >= summary.section_order.length;

  const label = isFullyLive ? "LIVE" : "PARTIAL";
  const color = isFullyLive ? "var(--tt-positive)" : "var(--tt-warn)";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "2px 8px",
        borderRadius: 4,
        border: `1px solid ${color}`,
        fontSize: 10,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: color,
        }}
      />
      {label}
    </span>
  );
}

export default function Header({
  lang,
  summary,
  asOf,
  refreshAction,
}: {
  lang: Lang;
  summary: Summary;
  asOf: string;
  refreshAction: () => Promise<void>;
}) {
  const { resolvedTheme, setTheme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const pathname = usePathname();

  const otherLang = lang === "zh" ? "en" : "zh";
  // Build the equivalent path in the other language by replacing the lang segment
  const otherLangPath = pathname
    ? pathname.replace(/^\/(zh|en)/, `/${otherLang}`)
    : `/${otherLang}`;

  function handleRefresh() {
    startTransition(async () => {
      await refreshAction();
    });
  }

  return (
    <header
      style={{
        height: 52,
        minHeight: 52,
        position: "sticky",
        top: 0,
        zIndex: 30,
        background: "var(--tt-panel)",
        borderBottom: "1px solid var(--tt-border)",
        display: "flex",
        alignItems: "center",
        padding: "0 16px",
        gap: 12,
      }}
    >
      {/* Left: label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--tt-muted)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {lang === "zh" ? "机构动向监控" : "Smart Money Monitor"}
        </span>
      </div>

      {/* Right cluster */}
      <div
        style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}
      >
        {/* AS OF */}
        <span
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--tt-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          AS OF {formatAsOf(asOf)}
        </span>

        {/* Freshness pill */}
        <FreshnessPill summary={summary} />

        {/* Separator */}
        <span
          style={{ width: 1, height: 20, background: "var(--tt-border)" }}
        />

        {/* Language toggle */}
        <div style={{ display: "flex", gap: 2 }}>
          {(["zh", "en"] as const).map((l) => {
            const isActive = l === lang;
            return (
              <Link
                key={l}
                href={isActive ? "#" : otherLangPath}
                style={{
                  padding: "3px 8px",
                  borderRadius: 4,
                  fontSize: 11,
                  fontWeight: isActive ? 600 : 400,
                  fontFamily:
                    "var(--font-geist-mono), ui-monospace, monospace",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  color: isActive ? "var(--tt-accent)" : "var(--tt-muted)",
                  background: isActive
                    ? "color-mix(in srgb, var(--tt-accent) 12%, transparent)"
                    : "transparent",
                  border: isActive
                    ? "1px solid color-mix(in srgb, var(--tt-accent) 30%, transparent)"
                    : "1px solid transparent",
                  textDecoration: "none",
                  pointerEvents: isActive ? "none" : "auto",
                }}
              >
                {l}
              </Link>
            );
          })}
        </div>

        {/* Theme toggle */}
        <button
          onClick={() =>
            setTheme(resolvedTheme === "dark" ? "light" : "dark")
          }
          aria-label={lang === "zh" ? "切换主题" : "Toggle theme"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid var(--tt-border)",
            background: "transparent",
            color: "var(--tt-muted)",
            cursor: "pointer",
          }}
        >
          {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>

        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={isPending}
          aria-label={lang === "zh" ? "刷新数据" : "Refresh data"}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 28,
            height: 28,
            borderRadius: 6,
            border: "1px solid var(--tt-border)",
            background: "transparent",
            color: isPending ? "var(--tt-accent)" : "var(--tt-muted)",
            cursor: isPending ? "default" : "pointer",
            opacity: isPending ? 0.6 : 1,
          }}
        >
          <RefreshCw
            size={14}
            style={{
              animation: isPending ? "spin 1s linear infinite" : "none",
            }}
          />
        </button>
      </div>
    </header>
  );
}
