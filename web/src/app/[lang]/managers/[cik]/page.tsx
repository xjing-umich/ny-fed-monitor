import { notFound, permanentRedirect } from "next/navigation";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { investorPath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";

export async function generateStaticParams() {
  const idx = await getManagerIndex();
  const langs = ["zh", "en"] as const;
  return langs.flatMap((lang) =>
    idx.managers.map((m) => ({ lang, cik: m.cik }))
  );
}

export default async function LegacyManagerDetailPage({
  params,
}: {
  params: Promise<{ lang: string; cik: string }>;
}) {
  const { lang: rawLang, cik } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const d = await getManagerDetail(cik);
  if (!d) notFound();

  permanentRedirect(investorPath(lang, d.manager.slug));
}
