import { ingestReferenceRates, serializeError } from "@/lib/ingestion/referenceRates";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  if (!hasSupabaseEnv()) {
    return Response.json({
      ok: false,
      status: "unknown",
      warning: "Market database is not configured.",
    });
  }

  try {
    const result = await ingestReferenceRates();
    return Response.json(result);
  } catch (error: unknown) {
    const details = serializeError(error);
    return Response.json(
      {
        ok: false,
        status: "failed",
        message: details.message,
        details,
      },
      { status: 200 }
    );
  }
}
