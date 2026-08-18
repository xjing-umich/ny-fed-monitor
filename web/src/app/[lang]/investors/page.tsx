import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerQoQ } from "@/lib/managers/source";
import type { Lang } from "@/lib/nav";
import { altFor, ogFor } from "@/lib/seo";
import { localePath } from "@/lib/urls";
import { InvestorListClient } from "./InvestorListClient";
import SubNav from "@/components/shell/SubNav";

// 缺此导出 = 本页在构建期静态生成后**永不重新验证**,只有重新部署才更新数据。
// 2026-08 申报季实测:该页冻结在 5 天前的部署快照(81 家 Q1 + 13 家 Q2),而
// 同期 /investors/[slug] 因有 revalidate 已陆续翻到 Q2 —— 列表与详情自相矛盾。
// 与其它数据驱动页(首页/个股/共识/buys/sells)统一为日级 ISR;申报季的即时刷新
// 由 ingest 完成后调 /api/revalidate 承担,不靠缩短这个周期。
export const revalidate = 86400;

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const alternates = altFor(lang, "/investors");
  const meta =
    lang === "zh"
      ? {
          title: "超级投资者 — Compounder · 复利",
          description: "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。",
        }
      : {
          title: "Superinvestors — Compounder",
          description: "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.",
        };
  return {
    ...meta,
    alternates,
    ...ogFor({ lang, title: meta.title, description: meta.description, path: localePath(lang, "/investors") }),
  };
}

export default async function InvestorsPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") {
    notFound();
  }
  const lang = rawLang as Lang;

  const [idx, qoq] = await Promise.all([getManagerIndex(), getManagerQoQ()]);
  const managers = [...idx.managers]
    .sort((a, b) => b.totalValue - a.totalValue)
    .map((m) => ({ ...m, qoq: qoq.get(m.cik) }));

  return (
    <>
      <SubNav lang={lang} section="investors" active="all" />
      <Suspense
        fallback={
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
            …
          </p>
        }
      >
        <InvestorListClient lang={lang} managers={managers} nowMs={Date.now()} />
      </Suspense>
    </>
  );
}
