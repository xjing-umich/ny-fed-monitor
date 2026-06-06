import { permanentRedirect } from "next/navigation";
import type { Lang } from "@/lib/nav";

export default async function LegacyManagersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  permanentRedirect(`/${lang}/investors`);
}
