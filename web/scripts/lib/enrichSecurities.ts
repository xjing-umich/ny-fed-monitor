import { padCusip, openfigiIdType, parseMappingResult, type MappingResultItem, type SecurityRow } from "../../src/lib/securities/openfigi";

const OPENFIGI_URL = "https://api.openfigi.com/v3/mapping";

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

/** 调 OpenFIGI 映射一批(已补零)。返回与输入等长的结果数组。 */
export async function mapBatch(
  pairs: { cusip: string; issuer: string }[],
  apiKey?: string
): Promise<SecurityRow[]> {
  const body = pairs.map((p) => {
    const idValue = padCusip(p.cusip);
    // CINS(字母前缀, 外国注册在美上市股)须用 ID_CINS, 否则 OpenFIGI 查无;数字 CUSIP 用 ID_CUSIP。
    return { idType: openfigiIdType(idValue), idValue, exchCode: "US" };
  });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) headers["X-OPENFIGI-APIKEY"] = apiKey;
  const res = await fetch(OPENFIGI_URL, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`OpenFIGI HTTP ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as MappingResultItem[];
  return pairs.map((p, i) => parseMappingResult(p.cusip, p.issuer, json[i] ?? { warning: "no result" }));
}

/**
 * 从 holdings 取去重 cusip(带 issuer), 跳过 security_cusips 中已 resolved 的, 分批富化并 upsert 两表。
 * db: supabase client。返回统计。
 */
export async function enrichSecurities(db: any, apiKey?: string): Promise<{ total: number; resolved: number; unresolved: number; skippedBatches: number }> {
  // 1) 去重 cusip + 代表性 issuer(分页读 holdings)
  const cusipIssuer = new Map<string, string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("holdings").select("cusip,issuer").range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) if (!cusipIssuer.has(r.cusip)) cusipIssuer.set(r.cusip, r.issuer);
    if (data.length < 1000) break;
  }

  // 2) 已 resolved 的跳过(幂等)
  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("security_cusips").select("cusip").eq("resolved", true).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    for (const r of data) done.add(r.cusip);
    if (data.length < 1000) break;
  }

  const todo = [...cusipIssuer.entries()].filter(([c]) => !done.has(c)).map(([cusip, issuer]) => ({ cusip, issuer }));

  // 3) 分批: 有 key 100/批, 无 key 10/批; 限速避免 429
  const batchSize = apiKey ? 100 : 10;
  const intervalMs = apiKey ? 300 : 2600; // 无 key < 25 req/min
  let resolved = 0, unresolved = 0, skippedBatches = 0;
  for (let i = 0; i < todo.length; i += batchSize) {
    const batch = todo.slice(i, i + batchSize);
    let rows: SecurityRow[];
    try {
      rows = await mapBatch(batch, apiKey);
    } catch (e) {
      // 数据准确性: 整批失败(如 429/5xx)不静默丢弃——计数并上报, 这些 cusip 留待下次跑补齐。
      console.warn(`batch ${i}-${i + batch.length} failed (跳过, 下次重试): ${e instanceof Error ? e.message : e}`);
      skippedBatches++;
      await sleep(intervalMs);
      continue;
    }
    // securities upsert(仅 resolved 行)
    const secs = rows.filter((r) => r.resolved && r.ticker).map((r) => ({
      ticker: r.ticker, name: r.name, exchange: r.exchange, figi: r.figi, primary_cusip: r.cusip, source: "openfigi", as_of: new Date().toISOString().slice(0, 10),
    }));
    if (secs.length) {
      const { error } = await db.from("securities").upsert(secs, { onConflict: "ticker" });
      if (error) console.warn(`securities upsert err: ${error.message}`);
    }
    // security_cusips upsert(全部行, 含未解析占位以免下次重查)
    const maps = rows.map((r) => ({ cusip: r.cusip, ticker: r.ticker, issuer: r.name, resolved: r.resolved, source: "openfigi" }));
    const { error: mErr } = await db.from("security_cusips").upsert(maps, { onConflict: "cusip" });
    if (mErr) console.warn(`security_cusips upsert err: ${mErr.message}`);
    for (const r of rows) (r.resolved ? resolved++ : unresolved++);
    console.log(`progress ${Math.min(i + batchSize, todo.length)}/${todo.length} (resolved ${resolved}, unresolved ${unresolved})`);
    await sleep(intervalMs);
  }
  return { total: todo.length, resolved, unresolved, skippedBatches };
}
