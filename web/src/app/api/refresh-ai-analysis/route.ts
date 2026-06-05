import { refreshAiAnalysis } from "@/lib/ai/deepseek";

export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(await refreshAiAnalysis());
}
