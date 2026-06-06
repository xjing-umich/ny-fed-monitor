import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { generateAndCacheNarrative } from "@/lib/ai/investorNarrativeServer";
import type { ManagerDetailLike, Lang } from "@/lib/ai/investorNarrative";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const secret = process.env.NARRATIVE_REFRESH_TOKEN;
  if (!secret || token !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const slugParam = url.searchParams.get("slug");
  const langParam = url.searchParams.get("lang") as Lang | null;
  const langs: Lang[] = langParam === "zh" || langParam === "en" ? [langParam] : ["zh", "en"];

  const idx = await getManagerIndex();
  const slugs = (slugParam ? idx.managers.filter((m) => m.slug === slugParam) : idx.managers).map(
    (m) => m.slug
  );

  const results: { slug: string; lang: Lang; ok: boolean; error?: string }[] = [];
  for (const slug of slugs) {
    const d = (await getManagerDetail(slug)) as ManagerDetailLike | null;
    if (!d) {
      results.push({ slug, lang: "zh", ok: false, error: "no detail" });
      continue;
    }
    for (const lang of langs) {
      try {
        await generateAndCacheNarrative(d, lang);
        results.push({ slug, lang, ok: true });
      } catch (e) {
        results.push({ slug, lang, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const made = results.filter((r) => r.ok).length;
  return Response.json({ ok: true, made, total: results.length, results });
}
