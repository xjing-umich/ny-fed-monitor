/** Shared build-time flag. Keep the direct env access for Next.js inlining. */
export function accountTrackingEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNT_TRACKING_ENABLED === "1";
}

export type AuthConfig = {
  url: string;
  publishableKey: string;
};

function projectUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Supabase project URL must use HTTP or HTTPS");
  }
  return url.href.replace(/\/+$/, "");
}

/** Lazy configuration only: importing this module never initializes an auth client. */
export function getAuthConfig(): AuthConfig | null {
  if (!accountTrackingEnabled()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) {
    throw new Error(
      "Account tracking requires NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  }

  const normalizedUrl = projectUrl(url);
  if (typeof window === "undefined" && process.env.SUPABASE_URL) {
    if (normalizedUrl !== projectUrl(process.env.SUPABASE_URL)) {
      throw new Error("NEXT_PUBLIC_SUPABASE_URL must match SUPABASE_URL for account tracking");
    }
  }

  return { url: normalizedUrl, publishableKey };
}
