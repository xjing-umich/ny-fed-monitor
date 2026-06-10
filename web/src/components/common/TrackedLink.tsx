"use client";

import React from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";

/**
 * 可打点的内链原语：onClick fire-and-forget track() 后正常导航。
 * 打点容错（adblock 拦截/抛错绝不阻断跳转）。children 由调用方（服务端）渲染，
 * 本组件仅是可点壳层 → client JS 仅几行。组件无业务知识，payload 原样透传。
 */
export function TrackedLink({
  href,
  event,
  payload,
  className,
  children,
}: {
  href: string;
  event: string;
  payload?: Record<string, string>;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const onClick = () => {
    try {
      track(event, payload ?? {});
    } catch {
      /* analytics blocked — ignore */
    }
  };
  return (
    <Link href={href} onClick={onClick} className={className}>
      {children}
    </Link>
  );
}
