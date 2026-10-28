"use client";

import { Analytics } from "@vercel/analytics/next";
import { isExcluded } from "@/lib/analytics/exclusion";

/** Vercel Analytics，丢弃内部/自动化浏览器的访问（口径同 PostHog，见 lib/analytics/exclusion）。 */
export function SiteAnalytics() {
  return <Analytics beforeSend={(event) => (isExcluded() ? null : event)} />;
}
