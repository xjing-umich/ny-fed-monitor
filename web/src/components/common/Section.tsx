import React from "react";
import { cn } from "@/lib/utils";

const RHYTHM = { sm: "mt-8", md: "mt-16", lg: "mt-24", xl: "mt-32" } as const;

/** 落地页节奏原语 — 替代散落的魔法 margin（mt-28/32/24/20…）。 */
export function Section({
  rhythm = "lg",
  className,
  children,
}: {
  rhythm?: keyof typeof RHYTHM;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return <section className={cn(RHYTHM[rhythm], className)}>{children}</section>;
}
