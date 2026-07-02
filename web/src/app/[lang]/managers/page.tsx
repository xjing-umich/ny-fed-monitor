import { permanentRedirect } from "next/navigation";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

export default async function LegacyManagersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  permanentRedirect(localePath(lang, "/investors"));
}
