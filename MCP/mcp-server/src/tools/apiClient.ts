const BASE_URL_ENV = "TREASURY_MONITOR_BASE_URL";

export type ApiResult = {
  ok: boolean;
  endpoint: string;
  status?: number;
  data?: unknown;
  error?: string;
};

export function getBaseUrl(): string | null {
  const baseUrl = process.env[BASE_URL_ENV]?.trim();

  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, "");
}

export function configurationError(path: string): ApiResult {
  return {
    ok: false,
    endpoint: path,
    error:
      `${BASE_URL_ENV} is not configured. Set it to your Treasury Monitor base URL, ` +
      "for example http://localhost:3000.",
  };
}

export async function fetchTreasuryMonitorEndpoint(path: string): Promise<ApiResult> {
  const baseUrl = getBaseUrl();

  if (!baseUrl) {
    return configurationError(path);
  }

  const endpoint = new URL(path, baseUrl).toString();

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
    });

    const contentType = response.headers.get("content-type") ?? "";
    const data = contentType.includes("application/json")
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      return {
        ok: false,
        endpoint,
        status: response.status,
        error: `Treasury Monitor API returned HTTP ${response.status}.`,
        data,
      };
    }

    return {
      ok: true,
      endpoint,
      status: response.status,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      endpoint,
      error: error instanceof Error ? error.message : "Unknown API request error.",
    };
  }
}

export function asJsonText(result: ApiResult) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}
