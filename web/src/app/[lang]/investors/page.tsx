import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getManagerIndex, getManagerQoQ } from "@/lib/managers/source";
import type { Lang } from "@/lib/nav";
import { altFor, ogFor, collectionLd, breadcrumbLd, listMetadata } from "@/lib/seo";
import { effectiveMovesPeriod, quarterLabel } from "@/lib/freshness/derive";
import { investorPath, localePath } from "@/lib/urls";
import { displayFundName } from "@/lib/managers/profileProse";
import { InvestorListClient } from "./InvestorListClient";
import SubNav from "@/components/shell/SubNav";
import PageHeader from "@/components/common/PageHeader";
import { LinkDirectory } from "@/components/list/LinkDirectory";
import { managerLabel } from "@/lib/managers/displayName";

// 页头与默认第一页均在服务器输出；只有叶子 URL 读取器使用 Suspense。
const HEAD = {
  zh: {
    eyebrow: "SEC 13F · 季度披露",
    heading: "超级投资者",
    subtitle: "按持仓市值排列 · 最新 13F 季",
    dirEyebrow: "目录",
    dirTitle: (n: number) => `全部 ${n} 位投资者，按名称拼音排序`,
  },
  en: {
    eyebrow: "SEC 13F · quarterly filings",
    heading: "Superinvestors",
    subtitle: "Ranked by portfolio value · latest 13F quarter",
    dirEyebrow: "Directory",
    dirTitle: (n: number) => `All ${n} investors, A–Z`,
  },
} as const;

// 缺此导出 = 本页在构建期静态生成后**永不重新验证**,只有重新部署才更新数据。
// 2026-08 申报季实测:该页冻结在 5 天前的部署快照(81 家 Q1 + 13 家 Q2),而
// 同期 /investors/[slug] 因有 revalidate 已陆续翻到 Q2 —— 列表与详情自相矛盾。
// 与其它数据驱动页统一走 ISR(列表页 3 天);申报季的即时刷新
// 由 ingest 发现新 filing 后调 /api/revalidate 承担,不靠缩短这个周期。
export const revalidate = 259200;

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
  const idx = await getManagerIndex();
  const quarter = quarterLabel(effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date()).period, lang);
  const meta = listMetadata(lang, "investors", idx.managers.length, quarter || null);
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
    // 零持仓季(holdingCount 0):manager_qoq RPC 只看有 holdings 行的申报,会拿上两季比,与本行季度对不上 → 不显 QoQ。
    // label:展示名(中文站用中文名),服务端算好再传给客户端列表,免得把别名配置打进前端包。
    .map((m) => ({ ...m, label: managerLabel(lang, m.slug, m.person), qoq: m.holdingCount === 0 ? undefined : qoq.get(m.cik) }));

  const head = HEAD[lang];
  const quarter = quarterLabel(effectiveMovesPeriod(idx.managers.map((m) => m.period), new Date()).period, lang);
  const meta = listMetadata(lang, "investors", managers.length, quarter || null);
  const path = localePath(lang, "/investors");
  const ld = [
    collectionLd({
      lang,
      name: head.heading,
      description: meta.description,
      path,
      items: managers.map((m) => ({ name: m.label, path: investorPath(lang, m.slug) })),
    }),
    breadcrumbLd(lang, [{ name: head.heading, path }]),
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SubNav lang={lang} section="investors" active="all" />
      <div className="mb-4">
        <PageHeader eyebrow={head.eyebrow} title={head.heading} intro={head.subtitle} />
      </div>
      <InvestorListClient lang={lang} managers={managers} nowMs={Date.now()} />
      <LinkDirectory
        sortLocale={lang === "zh" ? "zh-CN-u-co-pinyin" : "en"}
        eyebrow={head.dirEyebrow}
        title={head.dirTitle(managers.length)}
        items={managers.map((m) => ({
          href: investorPath(lang, m.slug),
          label: m.label,
          note: displayFundName(m.name),
        }))}
      />
    </>
  );
}
