import { getLatestAiAnalysis } from "@/lib/ai/deepseek";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getLatestAiAnalysis());
}
