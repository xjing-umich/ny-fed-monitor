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
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { upsertManagerDetail } from "./lib/supabaseUpsert.js";
import { enrichSecurities } from "./lib/enrichSecurities.js";
import { computeAndStoreConsensus } from "./lib/computeConsensus.js";
import { padCusip } from "../src/lib/securities/openfigi.js";
import { hasLongHoldings, isLongHolding, isRealHolding, isZeroHoldingsReport } from "./lib/holdingFilters.js";
import { holdingKey, resolvePeriodHoldings, type AmendmentType, type FilingVersion } from "./lib/amendments.js";
import { includedManagerSeq, noticeOtherManagerCiks, rowHasManagerSeq } from "./lib/notice13f.js";

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

const FILING_FORMS = ["13F-HR", "13F-HR/A", "13F-NT", "13F-NT/A"] as const;
type FilingForm = (typeof FILING_FORMS)[number];
type FilingMeta = { accession: string; filedAt: string; form: FilingForm };
const isFilingForm = (f: string): f is FilingForm => (FILING_FORMS as readonly string[]).includes(f);
const isHoldingsForm = (m: FilingMeta): m is FilingMeta & { form: "13F-HR" | "13F-HR/A" } =>
  m.form === "13F-HR" || m.form === "13F-HR/A";

async function getLatestFilings(cik: string, maxCount = 2) {
  const cik10 = cik.replace(/^0+/, "").padStart(10, "0");
  const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const data = await fetchJson<SubmissionsData>(url);
  await sleep(250);

  const { form, accessionNumber, filingDate, reportDate } = data.filings.recent;
  const name = data.name;
  const formerNames = (data.formerNames ?? []).map((f) => f.name).filter(Boolean);

  // 每季收齐原始件(13F-HR)与全部修正(13F-HR/A),由 resolvePeriodHoldings 按申报顺序合并。
  // 此前每季只取一份(实际总是原始件),修正一律被忽略。
  // 13F-NT 也收:该季若只有 NT(持仓由他人代报),ingestManager 会去跟随代报方的 13F-HR。
  const byPeriod = new Map<string, FilingMeta[]>();
  form.forEach((f, i) => {
    if (!isFilingForm(f)) return;
    const list = byPeriod.get(reportDate[i]) ?? [];
    list.push({ accession: accessionNumber[i], filedAt: filingDate[i], form: f });
    byPeriod.set(reportDate[i], list);
  });
  const selected = [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .slice(0, maxCount)
    .map(([period, versions]) => ({ period, versions }));

  return { name, formerNames, filings: selected };
}

type ParsedInfoTable = { holdings: Holding[]; zeroReport: boolean; rowCount: number; keptRows: number };

/**
 * 解析 infotable。onlyManagerSeq:只保留 <otherManager> 含该序号的行(跟随 13F-NT 代报方时,
 * 从母公司合并报告里摘出被跟随经理人的仓位,见 lib/notice13f.ts)。
 */
async function parseInfoTable(cikInt: string, accession: string, onlyManagerSeq?: number): Promise<ParsedInfoTable> {
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

  const allEntries: unknown[] = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
  const entries =
    onlyManagerSeq == null
      ? allEntries
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      : allEntries.filter((e: any) => rowHasManagerSeq(e?.otherManager, onlyManagerSeq));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const holdings: Holding[] = entries.map((e: any) => {
    const shrs = e?.shrsOrPrnAmt ?? {};
    const rawValue = Number(e?.value ?? 0);
    // CUSIP 归一为标准 9 位(SEC 常缺前导零)。异常长度告警但不丢弃,便于发现脏数据。
    const rawCusip = String(e?.cusip ?? "").trim();
    // 大写:申报人常写小写(如 KKR 48251w104),不归一则与 security_cusips 的大写键对不上、拿不到 ticker。
    const cusip = rawCusip ? padCusip(rawCusip).toUpperCase() : "";
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

  // 跟随模式下筛完为空 = 没摘到任何仓位,不能当成"零持仓"。
  const zeroReport = onlyManagerSeq == null && isZeroHoldingsReport(holdings);
  return { holdings: holdings.filter(isRealHolding), zeroReport, rowCount: allEntries.length, keptRows: entries.length };
}

function primaryDocUrl(cikInt: string, accession: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accession.replace(/-/g, "")}/primary_doc.xml`;
}

/** 修正类型取自封面 primary_doc.xml 的 <amendmentType>;读不到返回 null(按逐键覆盖处理)。 */
async function fetchAmendmentType(cikInt: string, accession: string): Promise<AmendmentType> {
  const url = primaryDocUrl(cikInt, accession);
  try {
    const xml = await fetchText(url);
    await sleep(250);
    return amendmentTypeOf(xml);
  } catch {
    return null;
  }
}

function amendmentTypeOf(primaryDocXml: string): AmendmentType {
  const t = primaryDocXml.match(/<(?:\w+:)?amendmentType>\s*([^<]+?)\s*</i)?.[1].toUpperCase();
  return t === "RESTATEMENT" || t === "NEW HOLDINGS" ? t : null;
}

const sameCik = (a: string, b: string) => a.replace(/^0+/, "") === b.replace(/^0+/, "");

/**
 * 该季只交了 13F-NT:按 NT 封面 <otherManagersInfo> 找代报方,取代报方同季 13F-HR(含修正),
 * 只摘挂了本经理人序号的行(规则与理由见 lib/notice13f.ts)。找不到可归属的行 → 返回 [],该季照旧跳过。
 * 身份(accession/filedAt)取代报方的申报 —— 那才是这份持仓真实所在的文件。
 */
async function followNotice(slug: string, cik: string, period: string, notices: FilingMeta[]): Promise<FilingVersion[]> {
  const cikInt = cik.replace(/^0+/, "");
  const nt = [...notices].sort((a, b) => (a.filedAt < b.filedAt ? -1 : 1)).at(-1)!;
  const parents = noticeOtherManagerCiks(await fetchText(primaryDocUrl(cikInt, nt.accession))).filter((c) => !sameCik(c, cik));
  await sleep(250);
  if (parents.length === 0) {
    console.warn(`[${slug}] ${period}: 13F-NT ${nt.accession} 未列代报方 CIK,无法跟随`);
    return [];
  }
  for (const parent of parents) {
    // 代报方本身也在追踪名单里 → 它的页面已收这份申报;再挂到本户名下会与其 accession 冲突(filings 按 accession 唯一)。
    if (SEED_MANAGERS.some((m) => sameCik(m.cik, parent))) {
      console.warn(`[${slug}] ${period}: 代报方 CIK ${parent} 已在追踪名单,不重复挂靠`);
      continue;
    }
    const parentInt = parent.replace(/^0+/, "");
    const { name: parentName, filings: parentPeriods } = await getLatestFilings(parent, QUARTERS_TO_FETCH);
    const versions = (parentPeriods.find((p) => p.period === period)?.versions ?? []).filter(isHoldingsForm);
    const parsed: FilingVersion[] = [];
    for (const v of versions) {
      try {
        const cover = await fetchText(primaryDocUrl(parentInt, v.accession));
        await sleep(250);
        const seq = includedManagerSeq(cover, cik);
        if (seq == null) {
          console.warn(`[${slug}] ${period}: 代报方 ${parentName} ${v.accession} 封面未列本经理人为 included manager,不收`);
          continue;
        }
        const t = await parseInfoTable(parentInt, v.accession, seq);
        await sleep(300);
        if (t.holdings.length === 0) {
          console.warn(`[${slug}] ${period}: 代报方 ${v.accession} 无挂本经理人(序号 ${seq})的行,不收`);
          continue;
        }
        console.log(`[${slug}] ${period}: 跟随 13F-NT → ${parentName}(CIK ${parent})${v.form} ${v.accession},保留序号 ${seq} 的 ${t.keptRows}/${t.rowCount} 行`);
        const amendmentType = v.form === "13F-HR/A" ? amendmentTypeOf(cover) : null;
        parsed.push({ ...v, amendmentType, holdings: prepareVersionHoldings(t.holdings, period) });
      } catch (err) {
        console.warn(`[${slug}] ${period}: 跟随 ${parent} ${v.accession} 失败: ${err instanceof Error ? err.message : err}`);
      }
    }
    if (parsed.length) return parsed;
  }
  return [];
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

/** 单份申报:美元口径归一 + 按键聚合(合并修正之前的形态)。 */
function prepareVersionHoldings(rawHoldings: Holding[], period: string): Holding[] {
  return aggregateByCusip(normalizeValueForPeriod(rawHoldings, period));
}

function buildFilingData(
  filingMeta: { accession: string; filedAt: string; period: string },
  holdings: Holding[]
): FilingData {
  const totalValue = holdings.filter(isLongHolding).reduce((s, h) => s + h.value, 0);
  const withWeight = holdings.map((h) => ({
    ...h,
    weight: !h.putCall && totalValue > 0 ? h.value / totalValue : undefined,
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
  for (const { period, versions } of metas) {
    // 逐份解析;单份失败只丢这一份(原始件失败而修正可用时,修正仍能撑起该季)。
    // 该季没有任何 13F-HR、只有 13F-NT → 持仓在代报方的申报里,去跟随。
    const holdingsVersions = versions.filter(isHoldingsForm);
    let parsed: FilingVersion[] = [];
    if (holdingsVersions.length === 0) {
      try {
        parsed = await followNotice(seed.slug, seed.cik, period, versions);
      } catch (err) {
        console.warn(`[${seed.slug}] ${period}: 跟随 13F-NT 失败: ${err instanceof Error ? err.message : err}`);
      }
    }
    for (const v of holdingsVersions) {
      try {
        const t = await parseInfoTable(cikInt, v.accession);
        await sleep(300);
        const amendmentType = v.form === "13F-HR/A" ? await fetchAmendmentType(cikInt, v.accession) : null;
        parsed.push({ ...v, amendmentType, holdings: prepareVersionHoldings(t.holdings, period), zeroReport: t.zeroReport });
      } catch (err) {
        console.warn(`[${seed.slug}] Failed to parse ${v.form} ${v.accession} (${period}): ${err instanceof Error ? err.message : err}`);
      }
    }
    const resolved = resolvePeriodHoldings(parsed);
    if (!resolved) {
      console.warn(`[${seed.slug}] ${period}: 无可用申报(全部解析失败或为空表),跳过该季`);
      continue;
    }
    const amendments = resolved.applied.filter((a) => a !== resolved.accession);
    if (amendments.length) console.log(`[${seed.slug}] ${period}: 已合并修正 ${amendments.join(", ")}`);
    for (const sk of resolved.skipped) console.log(`[${seed.slug}] ${period}: 跳过 ${sk.accession}(${sk.reason})`);
    const fd = buildFilingData({ accession: resolved.accession, filedAt: resolved.filedAt, period }, resolved.holdings);
    if (resolved.zeroReport) {
      // 申报人报告本季零持仓:照收(filings 记 0/0,holdings 不写),页面据此显示"申报持仓为零"而不是上一季。
      filings.push(fd);
      console.log(`[${seed.slug}] ${period}: 申报持仓为零 (${resolved.accession})`);
      continue;
    }
    if (!hasLongHoldings(fd.holdings)) {
      console.warn(`[ingest-13f] 跳过无长仓 filing(仅含期权): ${resolved.accession} ${period}`);
      continue;
    }
    filings.push(fd);
    console.log(`[${seed.slug}] ${period}: ${fd.holdings.length} holdings, $${fd.totalValue.toLocaleString()}`);
  }

  if (filings.length === 0) {
    console.warn(`[${seed.slug}] No filings parsed, skipping.`);
    return null;
  }

  return assembleManagerDetail(manager, filings);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Optional partial run: INGEST_ONLY=gmo,baupost-group — only those slugs;
  // index.json / former-names.json are merged so the rest of the seed set stays intact.
  const onlySlugs = (process.env.INGEST_ONLY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const seeds =
    onlySlugs.length > 0
      ? SEED_MANAGERS.filter((m) => onlySlugs.includes(m.slug))
      : SEED_MANAGERS;
  if (onlySlugs.length > 0) {
    const missing = onlySlugs.filter((s) => !SEED_MANAGERS.some((m) => m.slug === s));
    if (missing.length > 0) {
      throw new Error(`INGEST_ONLY unknown slug(s): ${missing.join(", ")}`);
    }
    console.log(`INGEST_ONLY active: ${seeds.map((s) => s.slug).join(", ")}`);
  }

  const summaries: ManagerSummary[] = [];
  const allDetails: ManagerDetail[] = [];

  for (const seed of seeds) {
    try {
      const detail = await ingestManager(seed);
      if (!detail) continue;

      allDetails.push(detail);

      const outPath = path.join(OUT_DIR, `${seed.slug}.json`);
      fs.writeFileSync(outPath, JSON.stringify({ manager: detail.manager, filings: detail.filings }, null, 2));
      console.log(`[${seed.slug}] Written to ${outPath} (${detail.filings.length} quarters)`);

      const top = detail.filings[0];
      const longHoldings = top.holdings.filter(isLongHolding);
      const topHolding = longHoldings[0]?.issuer ?? "";
      summaries.push({
        cik: detail.manager.cik,
        slug: detail.manager.slug,
        name: detail.manager.name,
        person: detail.manager.person,
        period: top.period,
        filedAt: top.filedAt ?? null,
        totalValue: top.totalValue,
        holdingCount: longHoldings.length,
        topHolding,
      });
    } catch (err) {
      console.warn(`[${seed.slug}] FAILED: ${err instanceof Error ? err.message : err}`);
    }

    // Be polite — ~5 req/sec max
    await sleep(500);
  }

  const indexPath = path.join(OUT_DIR, "index.json");
  let indexManagers = summaries;
  if (onlySlugs.length > 0 && !fs.existsSync(indexPath)) {
    console.warn(`Index not found at ${indexPath}; writing seed-only index from this run.`);
  }
  if (onlySlugs.length > 0 && fs.existsSync(indexPath)) {
    const existing = JSON.parse(fs.readFileSync(indexPath, "utf8")) as ManagerIndex;
    const bySlug = new Map(existing.managers.map((m) => [m.slug, m]));
    for (const s of summaries) bySlug.set(s.slug, s);
    // Keep seed order; drop orphans no longer in managers.json.
    indexManagers = SEED_MANAGERS.map((m) => bySlug.get(m.slug)).filter(
      (m): m is ManagerSummary => Boolean(m)
    );
  }
  const index: ManagerIndex = {
    generatedAt: new Date().toISOString(),
    managers: indexManagers,
  };

  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2));
  console.log(`\nIndex written to ${indexPath}`);
  console.log(`Total managers in index: ${indexManagers.length} (this run: ${summaries.length})`);

  const formerPath = path.join(OUT_DIR, "former-names.json");
  let formerOut = FORMER_NAMES;
  if (onlySlugs.length > 0 && fs.existsSync(formerPath)) {
    const existingFormer = JSON.parse(fs.readFileSync(formerPath, "utf8")) as Record<
      string,
      string[]
    >;
    formerOut = { ...existingFormer, ...FORMER_NAMES };
  }
  fs.writeFileSync(formerPath, JSON.stringify(formerOut, null, 2));
  console.log(
    `Former names written to ${formerPath} (${Object.keys(formerOut).length} managers with history)`
  );

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
    // 落库前先比对:本次抓到的 filing 里有没有库里还没有的 accession。workflow 只在有新 filing 时
    // 才整站 revalidate —— 每周两次无差别刷新 ~2200 页会把 Vercel Hobby 的 ISR Writes 额度用穿。
    const newAccessions = await findNewAccessions(
      db,
      allDetails.flatMap((d) => d.filings.map((f) => f.accession)),
    );
    if (newAccessions === null) {
      console.warn("New-filing check failed — assuming changed so the site still gets revalidated.");
    } else {
      console.log(`New filings this run: ${newAccessions.length}${newAccessions.length ? ` (${newAccessions.slice(0, 10).join(", ")}${newAccessions.length > 10 ? ", …" : ""})` : ""}`);
    }
    setActionOutput("changed", newAccessions === null || newAccessions.length > 0 ? "true" : "false");
    if (newAccessions !== null) setActionOutput("new_filings", String(newAccessions.length));

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
      console.log(`Consensus: holdings ${c.holdings} 行, moves ${c.moves} 行, 拆股系数 ${c.splitFactors} 条, 季度汇总 ${c.summaries} 户`);
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
  // Partial runs (INGEST_ONLY) gate against the filtered seed subset only.
  const expected = seeds.length;
  const succeeded = summaries.length;
  setActionOutput("managers_ok", String(succeeded));
  const ratio = expected > 0 ? succeeded / expected : 0;
  if (ratio < MIN_SUCCESS_RATIO) {
    console.error(
      `13F ingest 护栏触发:${succeeded}/${expected} 位经理人成功 ` +
        `(${(ratio * 100).toFixed(1)}% < ${(MIN_SUCCESS_RATIO * 100).toFixed(0)}% 阈值)。标记本次运行失败。`
    );
    process.exitCode = 1;
  }
}

/** 返回库中尚不存在的 accession;查询出错返回 null(调用方按"有变化"处理,宁可多刷一次)。 */
async function findNewAccessions(db: SupabaseClient, accessions: string[]): Promise<string[] | null> {
  const unique = [...new Set(accessions)];
  const existing = new Set<string>();
  // 分块:控制 URL 长度,且每块远低于 PostgREST 默认 1000 行上限。
  for (let i = 0; i < unique.length; i += 100) {
    const chunk = unique.slice(i, i + 100);
    const { data, error } = await db.from("filings").select("accession").in("accession", chunk);
    if (error) {
      console.warn(`filings lookup failed: ${error.message}`);
      return null;
    }
    for (const row of (data ?? []) as Array<{ accession: string }>) existing.add(row.accession);
  }
  return unique.filter((a) => !existing.has(a));
}

/** 写 GitHub Actions step output;本地运行(无 GITHUB_OUTPUT)时为 no-op。 */
function setActionOutput(key: string, value: string) {
  const out = process.env.GITHUB_OUTPUT;
  if (out) fs.appendFileSync(out, `${key}=${value}\n`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
