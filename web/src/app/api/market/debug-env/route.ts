export const dynamic = "force-dynamic";

function hostname(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
}

export function GET(): Response {
  return Response.json({
    has_SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    has_SUPABASE_SERVICE_KEY: Boolean(process.env.SUPABASE_SERVICE_KEY),
    has_NEXT_PUBLIC_SUPABASE_URL: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    has_SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    supabase_host: hostname(process.env.SUPABASE_URL),
    next_public_supabase_host: hostname(process.env.NEXT_PUBLIC_SUPABASE_URL),
    node_env: process.env.NODE_ENV ?? null,
    vercel_env: process.env.VERCEL_ENV ?? null,
  });
}
