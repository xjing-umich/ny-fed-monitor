import "server-only";
import { fetchJsonWithRetry } from "@/lib/sources/nyfed";
import { persistIngestion, recordFailedIngestion } from "@/lib/ingestion/common";
import {
  MARKET_SHARE_FEEDS,
  buildMarketShareObservations,
  marketShareReleaseDate,
  marketShareSourceName,
  sanitizeNyFedSentinels,
  type MarketShareFeed,
} from "@/lib/ingestion/marketShare.pure";

export { marketShareSourceName } from "@/lib/ingestion/marketShare.pure";

export async function ingestMarketShare() {
  const startedAt = new Date().toISOString();

  // Fetch each feed independently — a single bad feed must NOT take down the
  // other (old code used Promise.all, so a malformed qtrly killed a healthy ytd).
  const settled = await Promise.allSettled(
    MARKET_SHARE_FEEDS.map((feed) =>
      fetchJsonWithRetry(feed.url, {
        tag: feed.tag,
        revalidate: 3600,
        sanitize: sanitizeNyFedSentinels,
      })
    )
  );

  const payloads: Array<{ raw: unknown; feed: MarketShareFeed; date: string | null }> = [];
  let anyFeedFailed = false;
  for (let i = 0; i < MARKET_SHARE_FEEDS.length; i++) {
    const result = settled[i];
    if (result.status === "fulfilled") {
      payloads.push({
        raw: result.value,
        feed: MARKET_SHARE_FEEDS[i],
        date: marketShareReleaseDate(result.value, MARKET_SHARE_FEEDS[i].containerKey),
      });
    } else {
      anyFeedFailed = true;
    }
  }

  // Only a TOTAL fetch failure (every feed down) is a hard failure.
  if (payloads.length === 0) {
    return recordFailedIngestion({
      sourceName: marketShareSourceName,
      startedAt,
      error:
        settled.find((r): r is PromiseRejectedResult => r.status === "rejected")?.reason ??
        new Error("Market Share: all feeds failed"),
    });
  }

  const observations = buildMarketShareObservations(payloads);

  return persistIngestion({
    sourceName: marketShareSourceName,
    observations,
    cadence: "quarterly",
    startedAt,
    // Partial if a feed failed outright or returned no usable release date.
    partial: anyFeedFailed || payloads.some((payload) => !payload.date),
    series: ["PD_MARKET_SHARE_TOTAL"],
  });
}
