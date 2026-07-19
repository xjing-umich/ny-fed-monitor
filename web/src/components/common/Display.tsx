import React from "react";
import { cn } from "@/lib/utils";

const SIZES = {
  xl: "text-5xl",
  "2xl": "text-7xl",
  "3xl": "text-8xl",
} as const;

/** 展示级数字/标题 — 全站"重音时刻"的唯一载体。glow 只给数据用。 */
export function Display({
  as: Tag = "div",
  size = "xl",
  glow = false,
  className,
  children,
}: {
  as?: "div" | "span" | "p" | "h1" | "h2";
  size?: keyof typeof SIZES;
  glow?: boolean;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <Tag
      className={cn(
        "tnum font-medium leading-none tracking-tight text-[var(--ink-1)]",
        SIZES[size],
        className,
      )}
      style={glow ? { textShadow: "var(--glow-primary)" } : undefined}
    >
      {children}
    </Tag>
  );
}
