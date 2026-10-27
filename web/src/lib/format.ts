/**
 * Formats a USD dollar amount with T/B/M suffixes.
 * e.g. 1_500_000_000 → "$1.50B"
 */
export function formatUSD(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 9.995e11) return `$${(v / 1e12).toFixed(2)}T`;
  if (abs >= 9.995e8) return `$${(v / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

/**
 * 安全边际展示:N%(不带符号)。标签都写"安全边际",带负号会读成"负的安全边际";
 * 四舍五入到 0 但实际 >0 → "<1%"。全站安全边际数字都走这里。
 */
export function fmtMarginPct(pct: number): string {
  const n = Math.round(pct * 100);
  return n <= 0 ? "<1%" : `${n}%`;
}

/**
 * 把全大写的发行人名(如 "AMAZON COM INC")转为标题大小写("Amazon Com Inc")。
 * 撇号后的字母保持小写,避免 "MOODY'S" → "Moody'S"(应为 "Moody's")。
 */
export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/('|’)([A-Za-z])/g, (_, apos, c) => apos + c.toLowerCase())
    .trim();
}

/**
 * 清洗 SEC EDGAR / 13F 发行人原始名,用于前端展示(标题、H1、表格、结构化数据、llms)。
 * 13F 名是全大写、按 28 字符截断、带交易所后缀的原始串("ALPHABET INC-CL A"、"WALT DISNEY CO/THE"、
 * "TAIWAN SEMICONDUCTOR-SP ADR"、"KEYSIGHT TECHNOLOGIES IN")。只做确定性的格式整理,不改名称主体:
 *   1. 标题化,去结尾标点与 EDGAR 限定词(Del/Formerly/New);
 *   2. 去 "/The"、"Ny Reg Shs" 一类上市后缀;ADR 统一写成 " ADR";股份类别统一写成 " Class A";
 *   3. 修大小写:ETF/ADR/US/MSCI 等缩写、.com、无元音的短缩写(CVS、CSX)、中间的 of/and/the;
 *   4. 被截断的结尾 " In" 补成 " Inc";仍无法靠规则还原的截断名,查 ISSUER_NAME_FIXES。
 * 例:"MICROSOFT CORP." → "Microsoft Corp";"ALPHABET INC-CL A" → "Alphabet Inc Class A";
 *     "WALT DISNEY CO/THE" → "Walt Disney Co";"AMAZON.COM INC" → "Amazon.com Inc"。
 */
export function cleanIssuer(raw: string): string {
  let s = titleCase(raw).replace(/\s+/g, " ");
  let prev = "";
  while (s !== prev) {
    prev = s;
    s = s
      .replace(/[.,\s]+$/, "")              // 结尾标点/空格
      .replace(/\s+(Del|Formerly|New)$/i, "") // EDGAR 结尾限定词
      .replace(/\/The$/i, "")                // "Walt Disney Co/The"
      .replace(/\/(?:De|Md|Ny|Nj|Pa|Va|Il|Oh|Mn|Wi|Mo|Tx|Ca|Ma|Ct|Ga|Fl|Cayman Isl)$/i, "") // 注册地后缀 "Corp/De"
      .replace(/[\s-]+(?:Ny\s+)?(?:Reg(?:istered)?)(?:\s+(?:Shs|Shr))?$/i, "") // "-Ny Reg Shs"、"Ag-Reg"
      .replace(/[\s-]+(?:Ny\s+|Ord\s+)?Shs$/i, "")  // "-Ny Shs"、" - B Shs"
      .replace(/\s*-\s*Sub\s+Vt$/i, "");     // 次级投票股 "-Sub Vt"
  }
  s = s.replace(/\/Cayman Isl\b/i, "");   // "Nu Holdings Ltd/Cayman Isl-A"
  // ADR:"-Sp Adr"、"-Spons Adr"、"-Sponsored Adr"、"-Sp Pref Adr"、"Adr Part Cer" → " ADR" / " Preferred ADR"
  s = s.replace(
    /\s*-?\s*(?:(?:Sp|Spn|Spon|Spons|Sponsored)\s+)?((?:Pref|Prf)\s+)?Adr(?:\s+Part\s+Cer)?$/i,
    (_, pref) => (pref ? " Preferred ADR" : " ADR"),
  );
  // 股份类别:"-Cl A"、"-Class A Shares"、" - A"、"-A"、" Cl B" → " Class A";无投票权股 → " Non-Voting"
  s = s.replace(/(?:\s*-\s*|\s+)(?:Cl(?:ass)?\s+)([A-C])(?:\s+Shares?)?$/i, " Class $1");
  s = s.replace(/\s*-\s*([A-C])$/, " Class $1");
  s = s.replace(/\s*-?\s*Non\s+(?:Voting|Vtg)(?:\s+Shrs?)?$/i, " Non-Voting");
  // 公司后缀与后续限定之间的连字符("Corp-Formula")换成空格。
  s = s.replace(/\b(Inc|Corp|Co|Ltd|Plc|Nv|Sa|Ag|Holdings?|Group)\s*-\s*(?=\S)/g, "$1 ");
  s = s.replace(/ In$/, " Inc");          // 28 字符截断:"Keysight Technologies In"
  s = s
    .split(" ")
    .map((w, i) => fixWordCase(w, i))
    .join(" ");
  return FIX_INDEX.get(s.toLowerCase()) ?? s;
}

// 固定写法:缩写、品牌大小写、13F 里的简写。键是标题化之后的单词。只列确知的,不做猜测式全大写。
const WORD_CASE: Record<string, string> = {
  // 法律形式与通用缩写
  Etf: "ETF", Adr: "ADR", Us: "US", Usa: "USA", Uk: "UK", Plc: "PLC", Llc: "LLC", Lp: "LP", Llp: "LLP", Nv: "NV", Sa: "SA",
  Ag: "AG", Se: "SE", Asa: "ASA", Sab: "SAB", Cv: "CV", Pbc: "PBC", Reit: "REIT", Ai: "AI", Xm: "XM",
  Msci: "MSCI", Spdr: "SPDR", Ftse: "FTSE", Qqq: "QQQ", Ii: "II", Iii: "III", "G-Iii": "G-III", Lpg: "LPG",
  // 13F 简写
  Hldgs: "Holdings", Mgmt: "Management", Intl: "International", Natl: "National", Bcshs: "Bancshares",
  // 字母缩写的公司名
  Asml: "ASML", Ase: "ASE", Cbre: "CBRE", Cdw: "CDW", Cf: "CF", Cnh: "CNH", Cnx: "CNX", Crh: "CRH", Csx: "CSX",
  Cvs: "CVS", Fmc: "FMC", Fnb: "FNB", Ftai: "FTAI", Gds: "GDS", Gfl: "GFL", Gsk: "GSK", Hca: "HCA", Hdfc: "HDFC",
  Hf: "HF", Hp: "HP", Hsbc: "HSBC", Ibm: "IBM", Icici: "ICICI", Idt: "IDT", Ing: "ING", Jbs: "JBS", Jsc: "JSC",
  Kb: "KB", Kbr: "KBR", Ke: "KE", Kkr: "KKR", Kla: "KLA", Kt: "KT", Lkq: "LKQ", Lpl: "LPL", Mgm: "MGM", Mks: "MKS",
  Mp: "MP", Mplx: "MPLX", Ncr: "NCR", Nrg: "NRG", Nvr: "NVR", Nxp: "NXP", Pbf: "PBF", Pdd: "PDD", Pnc: "PNC",
  Ppg: "PPG", Ppl: "PPL", Ptc: "PTC", Pvh: "PVH", Rbc: "RBC", Rtx: "RTX", Sap: "SAP", Slb: "SLB", Slm: "SLM",
  Sm: "SM", Sps: "SPS", Td: "TD", Te: "TE", Tjx: "TJX", Ttm: "TTM", Ubs: "UBS", Vf: "VF", Wr: "WR", Ww: "WW",
  Xp: "XP", Ypf: "YPF", Bgc: "BGC", Bwx: "BWX", Bw: "BW", Bbb: "BBB", Bxp: "BXP", Bp: "BP", Acm: "ACM", Ccc: "CCC",
  Dpc: "DPC", Heico: "HEICO", "At&T": "AT&T", Jm: "JM", Na: "NA", "3m": "3M", Macom: "MACOM",
  // 品牌的混合大小写
  Ishares: "iShares", Jpmorgan: "JPMorgan", Unitedhealth: "UnitedHealth", Paypal: "PayPal", Ebay: "eBay",
  Applovin: "AppLovin", Doordash: "DoorDash", Crowdstrike: "CrowdStrike", Gitlab: "GitLab", Netease: "NetEase",
  Lyondellbasell: "LyondellBasell", Astrazeneca: "AstraZeneca", Totalenergies: "TotalEnergies",
  Technipfmc: "TechnipFMC", Stmicroelectronics: "STMicroelectronics", Aercap: "AerCap",
  Renaissancere: "RenaissanceRe", Siriuspoint: "SiriusPoint", Makemytrip: "MakeMyTrip", Pagseguro: "PagSeguro",
  Dlocal: "dLocal", Inmode: "InMode", Stubhub: "StubHub", Newamsterdam: "NewAmsterdam", Nexgen: "NexGen",
  Anglogold: "AngloGold", Inbev: "InBev", Mccormick: "McCormick", Dupont: "DuPont", Echostar: "EchoStar",
  Natwest: "NatWest", Nvent: "nVent", Blackrock: "BlackRock", Fedex: "FedEx", Servicenow: "ServiceNow",
  Linkedin: "LinkedIn", Youtube: "YouTube", Diamondrock: "DiamondRock", "Equipmentshare.Com": "EquipmentShare.com",
};
// 名称中间的虚词小写("Bank Of America" → "Bank of America")。
const LOWER_MID = new Set(["Of", "And", "The", "For", "De"]);

function fixWordCase(w: string, i: number): string {
  if (WORD_CASE[w]) return WORD_CASE[w];
  if (i > 0 && LOWER_MID.has(w)) return w.toLowerCase();
  if (/\.Com$/.test(w)) return w.replace(/\.Com$/, ".com").replace(/^Jd\./, "JD.");
  return w;
}

/**
 * 全大写的申报主体(基金)名转展示名:"VIKING GLOBAL INVESTORS LP" → "Viking Global Investors LP"、
 * "HARRIS ASSOCIATES L P" → "Harris Associates LP"。只修大小写和法律形式写法,不动名称主体。
 */
export function cleanFilerName(raw: string): string {
  return titleCase(raw)
    .replace(/\s+/g, " ")
    .replace(/ L P$/, " LP") // "Harris Associates L P";"L.P." 本来就对,不动
    .split(" ")
    .map((w, i) => {
      const bare = w.replace(/,$/, "");
      const fixed = /^\d+[a-z]$/.test(bare) ? bare.toUpperCase() : fixWordCase(bare, i); // "7g" → "7G"
      return w.endsWith(",") ? `${fixed},` : fixed;
    })
    .join(" ");
}

// 13F 名被截断到 28 字符、规则补不回来的(多为 ETF),按清洗后的样子写出全名。
const ISSUER_NAME_FIXES: Record<string, string> = {
  "Interactive Brokers Gro Class A": "Interactive Brokers Group Class A",
  "Space Exploration Techn Class A": "Space Exploration Technologies Class A",
  "LyondellBasell Indu Class A": "LyondellBasell Industries Class A",
  "British American Tob ADR": "British American Tobacco ADR",
  "CCC Intelligent Solutions Ho": "CCC Intelligent Solutions Holdings",
  "Gaming and Leisure Propertie": "Gaming and Leisure Properties",
  "Weatherford International Pl": "Weatherford International PLC",
  "Tencent Music Entertainm ADR": "Tencent Music Entertainment ADR",
  "Itau Unibanco H Preferred ADR": "Itau Unibanco Holding Preferred ADR",
  "Fomento Economico Mex ADR": "Fomento Economico Mexicano ADR",
  "Liberty Latin Americ Class A": "Liberty Latin America Class A",
  "Liberty Latin Americ Class C": "Liberty Latin America Class C",
  "Cia Energetica de ADR": "Cia Energetica de Minas Gerais ADR",
  "Can Imperial Bk of Commerce": "Canadian Imperial Bank of Commerce",
  "Public Service Enterprise Gp": "Public Service Enterprise Group",
  "Sumitomo Mitsui ADR": "Sumitomo Mitsui Financial Group ADR",
  "Ericsson (Lm) Tel ADR": "Ericsson ADR",
  "First Interstate Bancsys Class A": "First Interstate BancSystem Class A",
  "Cognizant Tech Solutions Class A": "Cognizant Technology Solutions Class A",
  "Colliers International Gr-Subord Vot": "Colliers International Group",
  "Schwab (Charles) Corp": "Charles Schwab Corp",
  "Fortune Brands Innovations I": "Fortune Brands Innovations Inc",
  "Koninklijke Philips Nvr- Ny": "Koninklijke Philips NV",
  "MACOM Technology Solutions H": "MACOM Technology Solutions Holdings",
  "Brookfield Asset Management Class A": "Brookfield Asset Management Class A",
  // ETF
  "SS SPDR S&P 500 ETF Trust-Us": "SPDR S&P 500 ETF Trust",
  "Ss Spdr S&P 500 ETF Trust-Us": "SPDR S&P 500 ETF Trust",
  "Ss SPDR S&P 500 ETF Trust-Us": "SPDR S&P 500 ETF Trust",
  "Ss SPDR Bb 1-3m T-Bill ETF": "SPDR Bloomberg 1-3 Month T-Bill ETF",
  "Ss Technology Select Sector": "Technology Select Sector SPDR Fund",
  "Ss Financial Select Sector": "Financial Select Sector SPDR Fund",
  "iShares Russell 1000 Value E": "iShares Russell 1000 Value ETF",
  "iShares Russell 2000 Value E": "iShares Russell 2000 Value ETF",
  "iShares Russell 1000 Growth": "iShares Russell 1000 Growth ETF",
  "iShares 0-3 Month Treasury B": "iShares 0-3 Month Treasury Bond ETF",
  "iShares Core S&P Small-Cap E": "iShares Core S&P Small-Cap ETF",
  "iShares Core MSCI Emerging": "iShares Core MSCI Emerging Markets ETF",
  "iShares MSCI Emr Mrk Ex Chna": "iShares MSCI Emerging Markets ex China ETF",
  "iShares MSCI Eafe Small-Cap": "iShares MSCI EAFE Small-Cap ETF",
  "iShares MSCI Eafe ETF": "iShares MSCI EAFE ETF",
  "iShares MSCI Acwi ETF": "iShares MSCI ACWI ETF",
  "Vanguard FTSE Emerging Marke": "Vanguard FTSE Emerging Markets ETF",
  "Vanguard Tot World Stk ETF": "Vanguard Total World Stock ETF",
  "Vanguard Total Stock Mkt ETF": "Vanguard Total Stock Market ETF",
  "Vanguard High Dvd Yield ETF": "Vanguard High Dividend Yield ETF",
  "Vanguard Dividend Apprec ETF": "Vanguard Dividend Appreciation ETF",
  "Vanguard 0-3m T-Bill ETF": "Vanguard 0-3 Month Treasury Bill ETF",
  "Schwab US Dvd Equity ETF": "Schwab US Dividend Equity ETF",
  "Vanguard Intermediate-Term T": "Vanguard Intermediate-Term Treasury ETF",
  "Ishar Fture Exp Tech ETF-Usd": "iShares Exponential Technologies ETF",
};
// 不分大小写查表;修好的名字自己也登记一次,再洗一遍时原样返回(幂等)。
const FIX_INDEX = new Map<string, string>(
  Object.entries(ISSUER_NAME_FIXES).flatMap(([k, v]) => [[k.toLowerCase(), v], [v.toLowerCase(), v]]),
);

/**
 * Returns "up" if value starts with "+", "down" if value starts with "-" followed by a digit,
 * null otherwise (unsigned numbers, "Unavailable", etc.).
 */
export function trendDirection(value: string | undefined | null): "up" | "down" | null {
  if (value == null) return null;
  const s = String(value);
  if (s.startsWith("+")) return "up";
  // "-$3.4 billion", "-3.4", etc. — any leading minus that is followed by a non-letter
  if (/^-[^a-zA-Z]/.test(s)) return "down";
  return null;
}

/** 价值带展示：下沿≈上沿(取整相等,如单灯无增长名 valueFloor=rangeHi)时折叠为单值，否则 lo–hi。 */
export function fmtValueBand(lo: number, hi: number, fmt: (n: number) => string): string {
  return Math.round(lo) === Math.round(hi) ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}
