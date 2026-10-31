import { financialNumbers, htmlTables, htmlText } from "./html";
import type { InterimDisclosureInput, InterimDisclosureResult } from "./types";

type Profile = { cik: string; scale: number; fyMonth: number };
// Official SEC issuer identities and reviewed statement units, never financial values.
const PROFILES: Record<string, Profile> =
{
  "AER": {
    "cik": "1378789",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "ARCO": {
    "cik": "1508478",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "NICE": {
    "cik": "1003935",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "BULL": {
    "cik": "1866364",
    "scale": 1,
    "fyMonth": 1
  },
  "SBLK": {
    "cik": "1386716",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "ITRN": {
    "cik": "1337117",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "WB": {
    "cik": "1595761",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "JOYY": {
    "cik": "1530238",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "INMD": {
    "cik": "1742692",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "TSEM": {
    "cik": "928876",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "CHKP": {
    "cik": "1015922",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "CAMT": {
    "cik": "1109138",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "NVMI": {
    "cik": "1109345",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "BRSL": {
    "cik": "1619762",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "SIMO": {
    "cik": "1329394",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "NBIS": {
    "cik": "1513845",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "DOX": {
    "cik": "1062579",
    "scale": 1000.0,
    "fyMonth": 10
  },
  "WIX": {
    "cik": "1576789",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "MNDY": {
    "cik": "1845338",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "GLBE": {
    "cik": "1835963",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "GENI": {
    "cik": "1834489",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "MRT": {
    "cik": "1852767",
    "scale": 1,
    "fyMonth": 1
  },
  "CGEN": {
    "cik": "1119774",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "AQN": {
    "cik": "1174169",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "DSGX": {
    "cik": "1050140",
    "scale": 1000.0,
    "fyMonth": 2
  },
  "FSV": {
    "cik": "1637810",
    "scale": 1000.0,
    "fyMonth": 1
  },
  "MGA": {
    "cik": "749098",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "STM": {
    "cik": "932787",
    "scale": 1000000.0,
    "fyMonth": 1
  },
  "DRTS": {
    "cik": "1871321",
    "scale": 1000.0,
    "fyMonth": 1
  }
};
const fail = (reason: string): InterimDisclosureResult => ({ status: "unsupported", reason });
const clean = (s: string) => s.replace(/[\u200b-\u200d\ufeff]/g, "").replace(/\s+/g, " ").trim();
const normalize = (s: string) => clean(s).replace(/STATEMEN TS/gi,"STATEMENTS");
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const date = (y:number,m:number,d=1) => `${y}-${String(m).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
const revenueLabel = /^(?:total (?:net )?(?:revenues?|sales)(?: and other income)?|net revenues?|net sales|revenues?|voyage revenues|revenues and other income)(?:\s*\(note \d+\))?$/i;
const incomeLabel = /^net (?:income|profit|earnings|loss)(?:\s*(?:\/\s*)?\(?\s*(?:income|loss|profit|earnings)\s*\)?)?(?: for the period)?$/i;
const values = (row:string[]) => financialNumbers(row.filter(c => c !== "$" && !/^\(?note \d+\)?$/i.test(c)));
const incomeValues=(row:string[])=>{const nums=values(row.slice(1));return nums&&/^net loss$/i.test(row[0])?nums.map(n=>-Math.abs(n)):nums;};

/** Read innermost tables even inside SEC layout tables; never merge parent/child columns. */
function tables(html:string) {
  const stack:{start:number;inner:number;children:boolean}[]=[];
  const out:(ReturnType<typeof htmlTables>[number] & { rawHtml:string })[]=[];
  for(const m of html.matchAll(/<\/?table\b[^>]*>/gi)) {
    if(!m[0].startsWith("</")) { if(stack.length)stack[stack.length-1].children=true;stack.push({start:m.index!,inner:m.index!+m[0].length,children:false}); }
    else {const opening=stack.pop();if(!opening || opening.children)continue;
      const prefix=normalize(htmlText(html.slice(0,opening.start))).slice(-1100);
      const table=htmlTables(html.slice(opening.start,m.index!+m[0].length))[0];
      if(table)out.push({precedingText:prefix,rawHtml:html.slice(opening.start,m.index!+m[0].length),rows:table.rows.map(row=>row.map(normalize).filter(Boolean)).filter(row=>row.length)});
    }
  }
  return out;
}

export function parseUsdComparables(input: InterimDisclosureInput): InterimDisclosureResult {
  const ticker=input.ticker.toUpperCase(), profile=PROFILES[ticker];
  if(!profile)return fail("No validated USD issuer profile");
  let url:URL;
  try {url=new URL(input.exhibitUrl);}catch{return fail("Invalid SEC URL");}
  if(url.hostname!=="www.sec.gov" || url.protocol!=="https:" || !/^\d{10}-\d{2}-\d{6}$/.test(input.accessionNumber)
    || !url.pathname.startsWith(`/Archives/edgar/data/${profile.cik}/${input.accessionNumber.replaceAll("-","")}/`)
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt) || !Number.isFinite(Date.parse(input.publishedAt)))return fail("Invalid SEC source identity/date");
  const all=normalize(htmlText(input.html));
  const allTables=tables(input.html);
  if (/(?:prepared|presented) (?:in accordance with|under|using) (?:the )?(?:IFRS|International Financial Reporting Standards)/i.test(all)) return fail("Explicit IFRS declaration conflicts with reviewed USD GAAP profile");
  const unitCurrencies = new Map<string,string>();
  for(const m of input.html.matchAll(/<(?:[\w-]+:)?unit\b[^>]*\bid=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:[\w-]+:)?unit>/gi)) {
    const measure = m[2].match(/iso4217:([A-Z]{3})/);
    if(measure)unitCurrencies.set(m[1],measure[1]);
  }
  if(ticker === "MGA") { const history = parseMgaHistory(input, allTables, all, unitCurrencies); if(history) return history; }
  const candidates:{revenue:number[];income:number[];year:number;month:number;days:number[];months:number;current:number;prior:number;header:string;sharedUnit:boolean;cashFlowIncome:boolean}[]=[];
  const diagnostics:string[]=[];
  for(const table of allTables) {
    const rows=table.rows.map(row=>ticker==="MGA" && row[0]==="Sales" && row[1]==="17" ? ["Sales",...row.slice(2)] : ticker==="BRSL" && row[0]==="Total revenue" && row[1]==="3" ? [row[0],...row.slice(2)] : row);
    const context=`${table.precedingText} ${rows.slice(0,3).flat().join(" ")}`;
    const headingMatches=[...context.matchAll(/consolidated (?:income statements?|statements? of (?:income|operations|earnings|loss))/gi)];
    const headingIndex=headingMatches.at(-1)?.index ?? 0;
    const headingPrefix=context.slice(Math.max(0,headingIndex-100),headingIndex);
    if (/non[- ]gaap/i.test(headingPrefix) || /IFRS/i.test(context.slice(headingIndex,headingIndex+220))) continue;
    const caption=context.slice(headingIndex);
    const arcoResults=ticker==="ARCO" && /Second Quarter 2026 Consolidated Results Figure 5/i.test(context);
    // Require consolidated income/operations caption, excluding cash-flow and non-GAAP reconciliation tables.
    if((!arcoResults && !/consolidated (?:income statements?|statements? of (?:income|operations|earnings|loss))/i.test(caption))
      || /(?:non[- ]gaap|reconciliation)/i.test(caption.slice(caption.toLowerCase().lastIndexOf("consolidated"))))continue;
    const isRevenue=(row:string[])=>revenueLabel.test(row[0]) || (ticker==="MGA" && row[0]==="Sales");
    let revenues=rows.filter(row=>isRevenue(row) && values(row.slice(1)));
    // Reviewed unlabeled totals immediately follow the last revenue component.
    const component=ticker==="WIX"?"Business Solutions":ticker==="AQN"?"Other revenue":ticker==="ITRN"?"Telematics products":null;
    if(ticker==="WIX") {
      const start=rows.findIndex(row=>/^Revenues$/i.test(row[0]));
      const end=rows.findIndex((row,i)=>i>start && /^Cost of Revenues$/i.test(row[0]));
      const block=start>=0 && end>start?rows.slice(start+1,end):[];
      const creative=block.filter(row=>row[0]==="Creative Subscriptions");
      const business=block.filter(row=>row[0]==="Business Solutions");
      const totals=block.filter(row=>values(row));
      const a=creative.length===1?values(creative[0].slice(1)):null;
      const b=business.length===1?values(business[0].slice(1)):null;
      const total=totals.length===1?values(totals[0]):null;
      if(!a || !b || !total || a.length!==4 || b.length!==4 || total.length!==4 || total.some((n,i)=>Math.abs(n-a[i]-b[i])>0.001)) {diagnostics.push("WIX revenue subtotal is ambiguous or does not reconcile");continue;}
      revenues=[["Total revenue",...totals[0]]];
    } else if(component) {const i=rows.findIndex(row=>row[0].toLowerCase()===component.toLowerCase());const row=rows[i+1];if(i>=0&&row&&values(row))revenues=[['Total revenue',...row]];}
    let incomes=rows.filter(row=>incomeLabel.test(row[0]) && values(row.slice(1)));
    let cashFlowIncome=false;
    if(ticker==="STM")revenues=revenues.filter(row=>/^net revenues$/i.test(row[0]));
    if(ticker==="GLBE" && !incomes.length) {
      const cash=allTables.filter(other=>/CONSOLIDATED STATEMENTS OF CASH FLOWS/i.test(other.precedingText) && /Global-E Online Ltd\./i.test(other.precedingText) && JSON.stringify(other.rows.slice(0,4))===JSON.stringify(rows.slice(0,4)));
      incomes=cash.flatMap(table=>table.rows.filter(row=>/^Net profit \(loss\)$/i.test(row[0]) && values(row.slice(1))));cashFlowIncome=incomes.length>0;
    }
    if(!revenues.length || !incomes.length){diagnostics.push("Missing consolidated revenue/net income rows");continue;}
    const firstRow=rows.findIndex(row=>isRevenue(row) || row[0]===component);
    const headers=rows.slice(0,firstRow), header=headers.flat().join(" ");
    if(/non[- ]gaap/i.test(header)){diagnostics.push("Non-GAAP header");continue;}
    const declared=`${caption} ${header}`;
    const scale=/\b(?:in millions|millions of (?:U\.?S\.? )?dollars)\b/i.test(declared)?1e6:/\b(?:in thousands|thousands of (?:U\.?S\.? )?dollars)\b/i.test(declared)?1e3:/Amounts expressed in US\$/i.test(declared) || (ticker==="BULL" && /using the US dollar as our reporting currency/i.test(all) && !/in thousands|in millions/i.test(declared))?1:null;
    // Dollar signs alone are insufficient except reviewed profiles whose source also declares USD.
    const boundCurrencies=[...table.rawHtml.matchAll(/\bunitRef=["']([^"']+)["']/g)].flatMap(m=>unitCurrencies.has(m[1])?[unitCurrencies.get(m[1])!]:[]);
    if(boundCurrencies.some(currency=>currency!=="USD")){diagnostics.push("Contradictory bound monetary unit");continue;}
    const usd = (boundCurrencies.length>0 && boundCurrencies.every(c=>c==="USD")) || /(?:\bU\.?S\.? dollars?\b|US\$|\bUSD\b)/i.test(declared)
      || /consolidated financial statements.{0,350}?(?:are denominated|are presented) in (?:U\.S\.|United States|US) dollars/i.test(all)
      || /consolidated financial statements are stated in millions of United States \(“U\.S\.”\) dollars/i.test(all)
      || /using the US dollar as our reporting currency/i.test(all)
      || /All financial numbers are in U\.?S\.? dollars unless otherwise noted/i.test(all)
      || (/iso4217:USD/.test(all) && !/iso4217:(?!USD)[A-Z]{3}/.test(all));
    const sharedUnit = !usd && ["CHKP","WIX","GLBE"].includes(ticker)
      && !/(?:\b(?:USD|CAD|EUR|CNY|RMB|JPY|HKD|AUD|SGD)\b|US\$|euros?|Renminbi|Canadian dollars)/i.test(declared)
      && boundCurrencies.length===0;
    if(scale!==profile.scale || (!usd && !sharedUnit) || /(?:euros|Renminbi|RMB|Canadian dollars)/i.test(declared)){diagnostics.push("Currency/scale not verified");continue;}
    const years=headers.find(row=>row.filter(c=>/^20\d{2}$/.test(c)).length>=2)?.filter(c=>/^20\d{2}$/.test(c)).map(Number)
      ?? [...header.matchAll(/\b20\d{2}\b/g)].map(m=>Number(m[0]));
    const monthNames=[...header.matchAll(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan\.|Feb\.|Mar\.|Apr\.|Jun\.|Jul\.|Aug\.|Sep\.|Oct\.|Nov\.|Dec\.)\s+(\d{1,2})\b/gi)];
    const duration=[...header.matchAll(/\b(three|six|nine)[ -]months(?: period)?(?: ended)?\b/gi)].map(m=>({three:3,six:6,nine:9})[m[1].toLowerCase()]!);
    const nums=values(revenues[0].slice(1)), inc=incomeValues(incomes[0]);
    if(!nums||!inc||nums.length!==inc.length||years.length!==nums.length||!monthNames.length){diagnostics.push(`Header/value width mismatch ${years.length}/${nums?.length}/${inc?.length}`);continue;}
    if(sharedUnit && (!rows.some(row=>row.filter(c=>c==="$").length===nums.length) || incomes.some(row=>row.filter(c=>c==="$").length!==nums.length))) {diagnostics.push("Shared dollar-column unit not verified");continue;}
    const year=Math.max(...years);
    const ytdDates=ticker==="CAMT"?monthNames.slice(0,1):monthNames;
    const lastYtd=ytdDates.at(-1)!;
    const month=MONTHS.findIndex(m=>m.toLowerCase().startsWith(lastYtd[1].replace(".","").toLowerCase()))+1;
    const months=duration.length?Math.max(...duration):/year to date/i.test(header)?((month-profile.fyMonth+12)%12)+1:0;
    if(!months||![3,6,9].includes(months)){diagnostics.push("No verified interim duration");continue;}
    const expected=((month-profile.fyMonth+12)%12)+1;
    if(months!==expected){diagnostics.push("Not complete fiscal YTD");continue;}
    // Reviewed layouts put each period's current/prior pair together; quarter may come first or last.
    let pair=duration[0]===months&&duration.at(-1)!==months?0:nums.length-2;
    if(ticker==="CAMT")pair=0; // six-month, quarter, annual comparison; annual not consumed.
    if(ticker==="SIMO"||ticker==="JOYY")pair=nums.length-2;
    const current=years[pair]===year?pair:pair+1,prior=current===pair?pair+1:pair;
    if(years[current]!==year||years[prior]!==year-1){diagnostics.push("Non-comparable years");continue;}
    if(monthNames.length===years.length) {
      const comparableDates=[monthNames[current],monthNames[prior]];
      if(comparableDates.some(d=>!MONTHS[month-1].toLowerCase().startsWith(d[1].replace(".","").toLowerCase())) || (ticker!=="STM" && comparableDates[0][2]!==comparableDates[1][2])) {diagnostics.push("Mismatched comparable date columns");continue;}
    }
    const days=monthNames.slice(-2).map(m=>Number(m[2]));
    const selectedDay=Number(lastYtd[2]);
    if(ticker!=="STM"&&selectedDay!==new Date(Date.UTC(year,month,0)).getUTCDate()){diagnostics.push("Non-month-end profile");continue;}
    const end=date(year,month,selectedDay),age=(Date.parse(input.publishedAt)-Date.parse(end))/864e5;
    if(!Number.isFinite(age)||age<0||age>180){diagnostics.push("Invalid availability/report dates");continue;}
    if(nums.some(n=>n<0)){diagnostics.push("Negative revenue");continue;}
    // Ambiguous duplicate rows never silently win.
    if(revenues.some(row=>JSON.stringify(values(row.slice(1)))!==JSON.stringify(nums)) || incomes.some(row=>JSON.stringify(incomeValues(row))!==JSON.stringify(inc))){diagnostics.push("Conflicting financial rows");continue;}
    candidates.push({revenue:nums,income:inc,year,month,days:ticker==="STM"?days:[selectedDay,selectedDay],months,current,prior,header,sharedUnit,cashFlowIncome});
  }
  if(!candidates.length)return fail([...new Set(diagnostics)].join("; ")||"No validated consolidated USD income table");
  const first=candidates[0];
  if(candidates.some(c=>JSON.stringify([c.revenue[c.current],c.revenue[c.prior],c.income[c.current],c.income[c.prior],c.year,c.month,c.months])!==JSON.stringify([first.revenue[first.current],first.revenue[first.prior],first.income[first.current],first.income[first.prior],first.year,first.month,first.months])))return fail("Conflicting consolidated tables");
  const fyYear=first.year-(first.month<profile.fyMonth?1:0),start=date(fyYear,profile.fyMonth),fiscalYearStart=start;
  const currentDay=ticker==="STM"?first.days[0]:first.days[1],priorDay=first.days[1];
  const accountingBasis = ["AER","BULL","SBLK","WB","JOYY","INMD","TSEM","BRSL","NBIS","WIX","GLBE","GENI","MRT","AQN","DSGX","FSV","MGA","STM","DRTS"].includes(ticker) ? "US-GAAP" : "GAAP-unspecified";
  return {status:"supported",evidence:{ticker,currency:first.sharedUnit?null:"USD",...(first.sharedUnit?{presentationUnit:"$" as const,sharedUnitVerified:true}:{}),accountingBasis,comparisonBasis:"ytd",fiscalYearStart,
    current:{start,end:date(first.year,first.month,currentDay),revenue:first.revenue[first.current]*profile.scale,netIncome:first.income[first.current]*profile.scale},
    prior:{start:date(fyYear-1,profile.fyMonth),end:date(first.year-1,first.month,priorDay),revenue:first.revenue[first.prior]*profile.scale,netIncome:first.income[first.prior]*profile.scale},
    source:{accessionNumber:input.accessionNumber,exhibitUrl:input.exhibitUrl,publishedAt:input.publishedAt,parserVersion:"usd-consolidated-ytd-v1",...(first.cashFlowIncome?{netIncomeSource:"consolidated_cash_flow" as const}:{})}}};
}

/** Reviewed 14-column financial review; prior YTD is explicitly derived from three reported quarters. */
function parseMgaHistory(input:InterimDisclosureInput, allTables:ReturnType<typeof tables>, text:string, unitCurrencies:Map<string,string>):InterimDisclosureResult|null {
  if(!/FINANCIAL REVIEW OF MAGNA INTERNATIONAL INC\./i.test(text))return null;
  if(!/United States dollars in millions/.test(text) || !/Prepared in accordance with U\.S\. GAAP/.test(text))return fail("MGA history currency/basis declaration missing");
  const selected=allTables.filter(t=>t.rows.some(r=>r[0]==="Net (loss) income") && t.rows[0]?.length===3 && t.rows[0].every(y=>/^20\d{2}$/.test(y)) && t.rows[1]?.[0]==="Note");
  if(selected.length!==1)return fail("MGA history table is missing or duplicated");
  const boundCurrencies=[...selected[0].rawHtml.matchAll(/\bunitRef=["\']([^"\']+)["\']/gi)].flatMap(m=>unitCurrencies.has(m[1])?[unitCurrencies.get(m[1])!]:[]);
  if(boundCurrencies.some(currency=>currency!=="USD"))return fail("MGA history contradictory bound monetary unit");
  const rows=selected[0].rows, years=rows[0];
  if(years.length!==3 || years.some(y=>!/^20\d{2}$/.test(y)))return fail("MGA history year header changed");
  const year=Number(years[2]);
  if(Number(years[0])!==year-2 || Number(years[1])!==year-1)return fail("MGA history years are not adjacent");
  const columns=["Note","1st Q","2nd Q","3rd Q","4th Q","TOTAL","1st Q","2nd Q","3rd Q","4th Q","TOTAL","1st Q","2nd Q","3rd Q","TOTAL"];
  if(JSON.stringify(rows[1])!==JSON.stringify(columns))return fail("MGA history quarter header changed");
  const corporation=rows.findIndex(r=>r[0]==="Corporate & Other"), netRows=rows.filter(r=>r[0]==="Net (loss) income");
  if(corporation<0 || !rows.some(r=>r[0]==="CONSOLIDATED STATEMENTS OF INCOME (LOSS)") || !rows.some(r=>r[0]==="Sales") || netRows.length!==1)return fail("MGA consolidated history labels missing");
  const revenue=values(rows[corporation+1]??[]), income=values(netRows[0].slice(1));
  if(!revenue || !income || revenue.length!==14 || income.length!==14)return fail("MGA history financial column width changed");
  const sum=(v:number[],from:number)=>v.slice(from,from+3).reduce((a,b)=>a+b,0);
  if(revenue.some(v=>v<0) || Math.abs(sum(revenue,10)-revenue[13])>0.01 || Math.abs(sum(income,10)-income[13])>0.01)return fail("MGA current YTD does not reconcile to reported quarters");
  const end=date(year,9,30), age=(Date.parse(input.publishedAt)-Date.parse(end))/864e5;
  if(age<0 || age>180)return fail("MGA history availability/report period mismatch");
  const evidence={ticker:"MGA",currency:"USD" as const,accountingBasis:"US-GAAP" as const,comparisonBasis:"ytd" as const,fiscalYearStart:date(year,1),
    current:{start:date(year,1),end,revenue:revenue[13]*1e6,netIncome:income[13]*1e6},
    prior:{start:date(year-1,1),end:date(year-1,9,30),revenue:sum(revenue,5)*1e6,netIncome:sum(income,5)*1e6},
    source:{accessionNumber:input.accessionNumber,exhibitUrl:input.exhibitUrl,publishedAt:input.publishedAt,parserVersion:"mga-reported-quarter-history-v1",
      priorDerivation:{method:"sum_reported_quarters" as const,fiscalYear:year-1,quarters:["Q1","Q2","Q3"] as ["Q1","Q2","Q3"],revenue:revenue.slice(5,8).map(v=>v*1e6),netIncome:income.slice(5,8).map(v=>v*1e6)}}};
  return {status:"supported",evidence};
}
