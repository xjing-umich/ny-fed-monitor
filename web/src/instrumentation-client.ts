import posthog from "posthog-js";
import { isExcluded, syncInternalFlag } from "@/lib/analytics/exclusion";

// 在 hydration 之前运行：先落内部开关，再决定是否初始化 PostHog。
// Vercel Analytics 的排除在 SiteAnalytics 的 beforeSend 里，读的是同一个开关。
syncInternalFlag();

const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;

if (key && !isExcluded()) {
  try {
    initPostHog(key);
  } catch {
    /* analytics blocked — ignore */
  }
}

function initPostHog(key: string): void {
  posthog.init(key, {
    // 经站内 /ingest 反代（next.config.ts），国内访问不直连 posthog.com，也不易被拦截。
    api_host: "/ingest",
    ui_host: "https://us.posthog.com",
    defaults: "2026-08-30",
    capture_pageview: "history_change",
    capture_pageleave: true,
    // 匿名访客也建档：回访、留存按“人”算，而不是按“次”。
    person_profiles: "always",
    disable_session_recording: true,
    disable_surveys: true,
  });

  // “真人”信号：本页出现第一次真实输入（点按、键盘、滚轮、触摸）时记一次 engaged。
  // 只开不看的自动化访问不会触发；看板里以 engaged 访客作为真人口径。
  const inputs = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
  const onFirstInput = () => {
    inputs.forEach((t) => window.removeEventListener(t, onFirstInput, true));
    posthog.capture("engaged");
  };
  inputs.forEach((t) => window.addEventListener(t, onFirstInput, { capture: true, passive: true }));
}
