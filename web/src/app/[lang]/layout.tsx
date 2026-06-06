import { redirect } from "next/navigation";
import { getManagerIndex } from "@/lib/managers/source";
import { MACRO_GROUPS } from "@/lib/nav";
import AppShell from "@/components/shell/AppShell";
import type { Lang } from "@/lib/nav";

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") {
    redirect("/en");
  }
  const lang = rawLang as Lang;

  // Build search items: managers + macro indicators
  const managerIdx = await getManagerIndex();
  const managerItems = managerIdx.managers.map((m) => ({
    label: m.person,
    href: `/${lang}/investors/${m.slug}`,
  }));

  const macroItems = MACRO_GROUPS.flatMap((group) =>
    group.indicators.map((indicator) => ({
      label: indicator,
      href: `/${lang}/macro/${indicator}`,
    }))
  );

  const items = [...managerItems, ...macroItems];

  return <AppShell lang={lang} items={items}>{children}</AppShell>;
}
