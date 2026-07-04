/**
 * SEC EDGAR 13F ingestion script
 * Fetches latest two 13F-HR filings for seed managers and writes JSON to src/data/13f/
 */

import { XMLParser } from "fast-xml-parser";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import type {
  Holding,
  FilingData,
  Manager,
  ManagerDetail,
  ManagerIndex,
  ManagerSummary,
} from "../src/lib/managers/types.js";
import { assembleManagerDetail } from "../src/lib/managers/assemble.js";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { upsertManagerDetail } from "./lib/supabaseUpsert.js";
import { enrichSecurities } from "./lib/enrichSecurities.js";
import { computeAndStoreConsensus } from "./lib/computeConsensus.js";
import { padCusip } from "../src/lib/securities/openfigi.js";

const HEADERS = {
  "User-Agent": "NYFedMonitor research junlinzhu@jobright.ai",
  Accept: "application/json",
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_MANAGERS: Omit<Manager, "name">[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../config/managers.json"), "utf8")
);
const OUT_DIR = path.join(__dirname, "../src/data/13f");

// slug → EDGAR 曾用名(基金改名史)。ingest 期填充,末尾 emit 到 former-names.json。
const FORMER_NAMES: Record<string, string[]> = {};

// 13F 为命脉。每位经理人独立 try/catch(单个失败不致命),但若成功占比过低,
// 整次跑必须标红(exit 1),否则"静默部分失败"会伪装成绿色成功,让 13F 悄悄变陈。
const MIN_SUCCESS_RATIO = 0.9;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { ...HEADERS, Accept: "text/xml,application/xml,text/plain" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

interface SubmissionsData {
  name: string;
  formerNames?: Array<{ name: string; from?: string; to?: string }>;
  filings: {
    recent: {
      form: string[];
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      primaryDocument: string[];
    };
  };
}

interface IndexItem {
  name: string;
  type?: string;
}

interface IndexData {
  directory: {
    item: IndexItem | IndexItem[];
  };
}

async function getLatestFilings(cik: string, maxCount = 2) {
  const cik10 = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const data = await fetchJson<SubmissionsData>(url);
  await sleep(250);

  const { form, accessionNumber, filingDate, reportDate } = data.filings.recent;
  const name = data.name;
  const formerNames = (data.formerNames ?? []).map((f) => f.name).filter(Boolean);

  // Find 13F-HR indices (prefer non-amendment first)
  const indices: number[] = [];
  form.forEach((f, i) => {
    if (f === "13F-HR" || f === "13F-HR/A") indices.push(i);
  });

  // Sort by reportDate desc
  indices.sort((a, b) => (reportDate[b] > reportDate[a] ? 1 : -1));

  // Take up to maxCount distinct reportDate filings
  const seen = new Set<string>();
  const selected: Array<{ accession: string; filedAt: string; period: string }> = [];
  for (const i of indices) {
    const rp = reportDate[i];
    if (!seen.has(rp)) {
      seen.add(rp);
      selected.push({
        accession: accessionNumber[i],
        filedAt: filingDate[i],
        period: rp,
      });
    }
    if (selected.length >= maxCount) break;
  }

  return { name, formerNames, filings: selected };
}

// 真实持仓谓词:排除 13F-NT 占位行(NONE / 全零 cusip / value+shares 全 0)。
export function isRealHolding(h: { cusip: string; issuer: string; value: number; shares: number }): boolean {
  if (!h.cusip || !h.issuer) return false;
  if (h.issuer.trim().toUpperCase() === "NONE") return false;
  if (/^0+$/.test(h.cusip)) return false;
  if ((h.value ?? 0) === 0 && (h.shares ?? 0) === 0) return false;
  return true;
}

async function parseInfoTable(cikInt: string, accession: string): Promise<Holding[]> {
  const accNoDashes = accession.replace(/-/g, "");
  const folder = `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accNoDashes}/`;
  const indexUrl = `${folder}index.json`;

  const indexData = await fetchJson<IndexData>(indexUrl);
  await sleep(250);

  const items = Array.isArray(indexData.directory.item)
    ? indexData.directory.item
    : [indexData.directory.item];

  // Find XML files that are not primary_doc.xml
  const xmlFiles = items
    .filter(
      (it) =>
        it.name &&
        it.name.toLowerCase().endsWith(".xml") &&
        it.name.toLowerCase() !== "primary_doc.xml"
    )
    .map((it) => it.name);

  if (xmlFiles.length === 0) {
    throw new Error(`No XML info table found in ${folder}`);
  }

  let infoTableXml = "";
  for (const fname of xmlFiles) {
    const txt = await fetchText(`${folder}${fname}`);
    await sleep(250);
    if (txt.includes("informationTable") || txt.includes("infoTable")) {
      infoTableXml = txt;
      break;
    }
  }

  if (!infoTableXml) {
    throw new Error(`No infoTable XML found for accession ${accession}`);
  }

  // parseTagValue/parseAttributeValue 必须关掉:否则 fast-xml-parser 会把 <cusip>037833100</cusip>
  // 当数字解析(丢前导零 → 37833100),把 <cusip>92343E102</cusip> 当科学计数法浮点(→ 9.2343e+106),
  // 损坏 CUSIP 主键。数值字段(value/sshPrnamt)下方已显式 Number(...),不受影响。
  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: true,
    parseTagValue: false,
    parseAttributeValue: false,
  });
  const parsed = parser.parse(infoTableXml);

  // Navigate to the infoTable entries
  const root = parsed?.informationTable ?? parsed;
  let rawEntries = root?.infoTable;
  if (!rawEntries) {
    // Try nested
    const keys = Object.keys(root ?? {});
    for (const k of keys) {
      if (root[k]?.infoTable) {
        rawEntries = root[k].infoTable;
        break;
      }
    }
  }

  if (!rawEntries) {
    throw new Error(`Cannot find infoTable in parsed XML for ${accession}`);
  }

  const entries: unknown[] = Array.isArray(rawEntries) ? rawEntries : [rawEntries];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holdings: Holding[] = entries.map((e: any) => {
    const shrs = e?.shrsOrPrnAmt ?? {};
    const rawValue = Number(e?.value ?? 0);
    // CUSIP 归一为标准 9 位(SEC 常缺前导零)。异常长度告警但不丢弃,便于发现脏数据。
    const rawCusip = String(e?.cusip ?? "").trim();
    const cusip = rawCusip ? padCusip(rawCusip) : "";
    if (cusip && cusip.length !== 9) {
      console.warn(`[ingest-13f] 异常 CUSIP 长度(${cusip.length}): "${rawCusip}" → "${cusip}"`);
    }
    // Determine if value is in dollars or thousands
    // For filings with reportDate year >= 2023, value is in whole dollars
    // We handle this at call site based on period
    return {
      cusip,
      issuer: String(e?.nameOfIssuer ?? ""),
      titleOfClass: e?.titleOfClass ? String(e.titleOfClass) : undefined,
      value: rawValue,
      shares: Number(shrs?.sshPrnamt ?? 0),
      putCall: e?.putCall ? String(e.putCall) : undefined,
    };
  });

  return holdings.filter(isRealHolding);
}

function normalizeValueForPeriod(holdings: Holding[], period: string): Holding[] {
  const year = parseInt(period.slice(0, 4), 10);
  if (year < 2023) {
    return holdings.map((h) => ({ ...h, value: h.value * 1000 }));
  }
  // Safety check: if max value is tiny, it's still in thousands
  const maxVal = Math.max(...holdings.map((h) => h.value));
  if (maxVal < 1e6 && holdings.length > 5) {
    return holdings.map((h) => ({ ...h, value: h.value * 1000 }));
  }
  return holdings;
}

// A 13F lists the same security multiple times (one row per internal sub-manager
// / account). Aggregate to one row per security (cusip + put/call type) so the UI
// shows e.g. a single AAPL line, matching how valuesider et al. present portfolios.
function holdingKey(h: Holding): string {
  return `${h.cusip}|${h.putCall ?? ""}`;
}

function aggregateByCusip(holdings: Holding[]): Holding[] {
  const map = new Map<string, Holding>();
  for (const h of holdings) {
    const key = holdingKey(h);
    const existing = map.get(key);
    if (existing) {
      existing.value += h.value;
      existing.shares += h.shares;
    } else {
      map.set(key, { ...h });
    }
  }
  return [...map.values()];
}

function buildFilingData(
  filingMeta: { accession: string; filedAt: string; period: string },
  rawHoldings: Holding[]
): FilingData {
  const normalized = normalizeValueForPeriod(rawHoldings, filingMeta.period);
  const holdings = aggregateByCusip(normalized);
  const totalValue = holdings.reduce((s, h) => s + h.value, 0);
  const withWeight = holdings.map((h) => ({
    ...h,
    weight: totalValue > 0 ? h.value / totalValue : 0,
  }));
  withWeight.sort((a, b) => b.value - a.value);
  return {
    period: filingMeta.period,
    filedAt: filingMeta.filedAt,
    accession: filingMeta.accession,
    holdings: withWeight,
    totalValue,
  };
}

const QUARTERS_TO_FETCH = 8;

async function ingestManager(seed: Omit<Manager, "name">): Promise<ManagerDetail | null> {
  const cikInt = seed.cik.replace(/^0+/, "");
  console.log(`\n[${seed.slug}] Fetching submissions...`);

  const { name, formerNames, filings: metas } = await getLatestFilings(seed.cik, QUARTERS_TO_FETCH);
  if (formerNames.length) FORMER_NAMES[seed.slug] = formerNames;
  console.log(`[${seed.slug}] Resolved name: ${name}, filings found: ${metas.length}`);

  if (metas.length === 0) {
    console.warn(`[${seed.slug}] No 13F-HR filings found, skipping.`);
    return null;
  }

  const manager: Manager = { cik: seed.cik, slug: seed.slug, name, person: seed.person };

  // 逐期解析（含礼貌限速）；单期解析失败仅跳过该期，不影响其余季度。
  const filings: FilingData[] = [];
  for (const meta of metas) {
    console.log(`[${seed.slug}] Parsing filing ${meta.accession} (${meta.period})...`);
    try {
      const raw = await parseInfoTable(cikInt, meta.accession);
      await sleep(300);
      const fd = buildFilingData(meta, raw);
      if (fd.holdings.length === 0) {
        console.warn(`[ingest-13f] 跳过空 filing(NONE/13F-NT): ${meta.accession} ${meta.period}`);
        continue;
      }
      filings.push(fd);
      console.log(`[${seed.slug}] ${meta.period}: ${fd.holdings.length} holdings, $${fd.totalValue.toLocaleString()}`);
    } catch (err) {
      console.warn(`[${seed.slug}] Failed to parse ${meta.period}: ${err instanceof Error ? err.message : err}`);
    }
  }

  if (filings.length === 0) {
    console.warn(`[${seed.slug}] No filings parsed, skipping.`);
    return null;
  }

  return assembleManagerDetail(manager, filings);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const summaries: ManagerSummary[] = [];
  const allDetails: ManagerDetail[] = [];

  for (const seed of SEED_MANAGERS) {
    try {
      const detail = await ingestManager(seed);
      if (!detail) continue;

      allDetails.push(detail);

      const outPath = path.join(OUT_DIR, `${seed.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ manager: detail.manager, filings: detail.filings }, null, 2));
      console.log(`[${seed.slug}] Written to ${outPath} (${detail.filings.length} quarters)`);

      const top = detail.filings[0];
      const topHolding = top.holdings[0]?.issuer ?? "";
      summaries.push({
        cik: detail.manager.cik,
        slug: detail.manager.slug,
        name: detail.manager.name,
        person: detail.manager.person,
        period: top.period,
        totalValue: top.totalValue,
        holdingCount: top.holdings.length,
        topHolding,
      });
    } catch (err) {
      console.warn(`[${seed.slug}] FAILED: ${err instanceof Error ? err.message : err}`);
    }

    // Be polite — ~5 req/sec max
    await sleep(500);
  }

  const index: ManagerIndex = {
    generatedAt: new Date().toISOString(),
    managers: summaries,
  };

  const indexPath = path.join(OUT_DIR, "index.json");
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nIndex written to ${indexPath}`);
  console.log(`Total managers processed: ${summaries.length}`);

  const formerPath = path.join(OUT_DIR, "former-names.json");
  fs.writeFileSync(formerPath, JSON.stringify(FORMER_NAMES, null, 2));
  console.log(`Former names written to ${formerPath} (${Object.keys(FORMER_NAMES).length} managers with history)`);

  // 凭据优先用 process.env(CI/GitHub Actions secrets)，本地回退仓库根 .env.local。
  const fileEnv: Record<string, string> = {};
  const envPath = path.join(__dirname, "../../.env.local");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  const env = { ...fileEnv, ...process.env } as Record<string, string>;
  const sbUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (sbUrl && sbKey) {
    const db = createClient(sbUrl, sbKey, {
      auth: { persistSession: false },
      realtime: { transport: WebSocket as unknown as never },
    });
    for (const detail of allDetails) {
      try { await upsertManagerDetail(db, detail, FORMER_NAMES[detail.manager.slug]); console.log(`[${detail.manager.slug}] upserted to Supabase`); }
      catch (e) { console.warn(`[${detail.manager.slug}] Supabase upsert failed: ${e}`); }
    }
    console.log("Supabase upsert done.");

    try {
      const stats = await enrichSecurities(db, env.OPENFIGI_API_KEY);
      console.log(`Securities enrich: 处理 ${stats.total}, 解析 ${stats.resolved}, 未解析 ${stats.unresolved}, 跳过批次 ${stats.skippedBatches}`);
    } catch (e) {
      console.warn(`Securities enrich failed (非致命): ${e instanceof Error ? e.message : e}`);
    }
    try {
      const c = await computeAndStoreConsensus(db);
      console.log(`Consensus: holdings ${c.holdings} 行, moves ${c.moves} 行`);
    } catch (e) {
      // Consensus is derived from the just-ingested 13F data. A write failure
      // here (schema drift, missing column, stale cache) must NOT pass as green
      // — it previously left consensus_moves silently empty. Mark the run failed
      // while keeping the 13F source data already written above.
      console.error(`Consensus 计算/写入失败:${e instanceof Error ? e.message : e}。标记本次运行失败。`);
      process.exitCode = 1;
    }
  } else {
    console.log("No Supabase env — JSON only (set SUPABASE_URL / SUPABASE_SERVICE_KEY to write DB).");
  }

  // 护栏:成功经理人占比低于阈值 → 标红。已落库的部分数据保留(上面已写),
  // 但 exit 1 让 GitHub Actions 显示失败,杜绝静默部分失败伪装成功。
  const expected = SEED_MANAGERS.length;
  const succeeded = summaries.length;
  const ratio = expected > 0 ? succeeded / expected : 0;
  if (ratio < MIN_SUCCESS_RATIO) {
    console.error(
      `13F ingest 护栏触发:${succeeded}/${expected} 位经理人成功 ` +
        `(${(ratio * 100).toFixed(1)}% < ${(MIN_SUCCESS_RATIO * 100).toFixed(0)}% 阈值)。标记本次运行失败。`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
