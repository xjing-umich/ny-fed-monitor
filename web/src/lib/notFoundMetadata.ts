import type { Metadata } from "next";
import type { Lang } from "./nav";

/** Use the metadata pipeline: a JSX title in not-found races streamed layout metadata. */
export function notFoundMetadata(lang: Lang): Metadata {
  return {
    title: lang === "zh" ? "页面未找到 — Compounder" : "Page not found — Compounder",
    robots: { index: false, follow: true },
  };
}
