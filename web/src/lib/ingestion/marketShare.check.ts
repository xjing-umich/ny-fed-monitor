/**
 * marketShare.check.ts — self-check for the NY Fed Market Share parse fixes.
 * Run: cd web && npx tsx src/lib/ingestion/marketShare.check.ts
 * (No vitest in this project — pure logic verified with node:assert.)
 *
 * Reproduces the three real defects found 2026-06-08:
 *   B1: NY Fed qtrly feed emits bare unquoted `*` → invalid JSON → whole source died.
 *   B2: code looked up marketshare["qtrly"] but the real key is "quarterly".
 *   B3: Promise.all let a bad qtrly take down a healthy ytd (resilience tested
 *       here at the pure-builder level; orchestration lives in marketShare.ts).
 */
import assert from "node:assert";
import {
  MARKET_SHARE_FEEDS,
  buildMarketShareObservations,
  marketShareReleaseDate,
  sanitizeNyFedSentinels,
} from "./marketShare.pure";

const QTRLY = MARKET_SHARE_FEEDS[0];
const YTD = MARKET_SHARE_FEEDS[1];

// Real-shape fixtures. The qtrly raw carries the exact upstream defect: a bare
// `*` value (`"dailyAvgVolInMillions": *`). Note the container key is "quarterly".
const qtrlyRaw = `{"pd":{"marketshare":{"quarterly":{"releaseDate":"2026-04-09","title":"QUARTER I 2026","interDealerBrokers":[{"securityType":"TREASURY BILLS","dailyAvgVolInMillions": *, "percentFirstQuintMktShare":"60.58"},{"securityType":"NOTES","dailyAvgVolInMillions":3084.2,"percentFirstQuintMktShare":"40.0"}],"others":[{"securityType":"TIPS","dailyAvgVolInMillions": * }]}}}}`;
const ytdRaw = `{"pd":{"marketshare":{"ytd":{"releaseDate":"2026-01-08","interDealerBrokers":[{"securityType":"TREASURY BILLS","dailyAvgVolInMillions":1500.5}]}}}}`;

// ── B1: bare `*` is invalid JSON; sanitize repairs it ────────────────────────
assert.throws(() => JSON.parse(qtrlyRaw), "raw qtrly with bare * must be invalid JSON");
const qtrlyFixed = JSON.parse(sanitizeNyFedSentinels(qtrlyRaw));
assert.ok(qtrlyFixed, "sanitized qtrly must parse");

// ── B2: container key "quarterly" (not "qtrly") resolves the release date ────
const qDate = marketShareReleaseDate(qtrlyFixed, QTRLY.containerKey);
assert.strictEqual(qDate, "2026-04-09", "quarterly release date must resolve via containerKey 'quarterly'");
assert.strictEqual(QTRLY.containerKey, "quarterly", "qtrly feed must look up 'quarterly'");

const ytdParsed = JSON.parse(sanitizeNyFedSentinels(ytdRaw));
const yDate = marketShareReleaseDate(ytdParsed, YTD.containerKey);
assert.strictEqual(yDate, "2026-01-08", "ytd release date must resolve");

// ── Build: both feeds contribute; bare-* row skipped, healthy rows kept ──────
const obs = buildMarketShareObservations([
  { raw: qtrlyFixed, feed: QTRLY, date: qDate },
  { raw: ytdParsed, feed: YTD, date: yDate },
]);
// quarterly interDealerBrokers: the suppressed-volume row (`*`→null) degrades to
// its percentFirstQuintMktShare (60.58, unit percent); the 3084.2 row → kept
// (unit millions_usd). The `others` TIPS row has a bare-* volume and NO percent
// fallback → value null → dropped. So quarterly yields exactly 2 obs.
// ytd: the 1500.5 row → kept.
const qObs = obs.filter((o) => o.metadata?.frequency === "quarterly");
const yObs = obs.filter((o) => o.metadata?.frequency === "ytd");
assert.strictEqual(qObs.length, 2, `expected 2 quarterly obs, got ${qObs.length}`);
const qVol = qObs.find((o) => o.unit === "millions_usd");
const qPct = qObs.find((o) => o.unit === "percent");
assert.ok(qVol && qVol.value === 3084.2, "quarterly volume obs must be 3084.2 (millions_usd)");
assert.ok(qPct && qPct.value === 60.58, "suppressed-volume row degrades to its 60.58 percent share");
assert.strictEqual(qObs[0].observation_date, "2026-04-09", "quarterly obs date");
assert.strictEqual(yObs.length, 1, `expected 1 ytd obs, got ${yObs.length}`);
assert.strictEqual(yObs[0].value, 1500.5, "ytd obs value");

// ── B3 (resilience at builder level): a missing qtrly feed must NOT lose ytd ─
const ytdOnly = buildMarketShareObservations([{ raw: ytdParsed, feed: YTD, date: yDate }]);
assert.strictEqual(ytdOnly.length, 1, "ytd alone still ingests when qtrly feed is absent");

// ── Sanitizer must not corrupt legitimately quoted values ────────────────────
const quoted = `{"a":"*","b":">=7.49","c":"x * y"}`;
const quotedParsed = JSON.parse(sanitizeNyFedSentinels(quoted));
assert.strictEqual(quotedParsed.a, "*", 'quoted "*" must survive sanitize');
assert.strictEqual(quotedParsed.b, ">=7.49", "range string untouched");
assert.strictEqual(quotedParsed.c, "x * y", "interior * in string untouched");

console.log("✓ marketShare.check.ts — all assertions passed (B1 sanitize, B2 key, B3 resilience)");
