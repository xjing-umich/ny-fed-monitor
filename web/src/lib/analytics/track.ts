import { track as vercelTrack } from "@vercel/analytics";
import posthog from "posthog-js";
import { isExcluded } from "./exclusion";

type Props = Record<string, string | number | boolean | null>;

/**
 * 站内唯一的打点入口：同一事件同时发 Vercel Analytics 与 PostHog（未配置 key 时 PostHog 不初始化，
 * 只发 Vercel）。内部/自动化浏览器直接丢弃。fire-and-forget：被拦截/抛错绝不影响调用方。
 */
export function track(event: string, props: Props = {}): void {
  if (isExcluded()) return;
  try {
    vercelTrack(event, props);
  } catch {
    /* analytics blocked — ignore */
  }
  try {
    if (posthog.__loaded) posthog.capture(event, props);
  } catch {
    /* analytics blocked — ignore */
  }
}
