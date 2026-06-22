/** 一次性 dev 工具(非运行时): 校验 config/managers.candidates.json 里每个候选 CIK
 *  在 SEC EDGAR 上确有可解析的近期 13F-HR 申报。纯只读网络工具, 不写文件, 不连 Supabase。
 *  用法: cd web && npx tsx scripts/validate-13f-filers.ts
 *
 *  准入门槛: filings.recent.form 含 "13F-HR"(或 "13F-HR/A") 且最近一期 reportDate >= 2024-06-30。
 *  数据源唯一真相: https://data.sec.gov/submissions/CIK##########.json (官方 name + 13F + reportDate)。 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const HEADERS = {
  "User-Agent": "NYFedMonitor research junlinzhu@jobright.ai",
  Accept: "application/json",
};
const MIN_REPORT_DATE = "2024-06-30";

interface Candidate {
  cik: string;
  slug: string;
  person: string;
}

interface SubmissionsData {
  name: string;
  filings: {
    recent: {
      form: string[];
      reportDate: string[];
    };
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const candidates: Candidate[] = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../config/managers.candidates.json"), "utf8")
  );

  let pass = 0;
  let fail = 0;

  for (const { cik, slug } of candidates) {
    const cik10 = cik.replace(/^0+/, "").padStart(10, "0");
    const url = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) {
        console.log(`FAIL ${slug} | HTTP ${res.status} for CIK${cik10}`);
        fail++;
        continue;
      }
      const data = (await res.json()) as SubmissionsData;
      const { form, reportDate } = data.filings.recent;

      let latest = "";
      for (let i = 0; i < form.length; i++) {
        if (form[i] === "13F-HR" || form[i] === "13F-HR/A") {
          if (reportDate[i] > latest) latest = reportDate[i];
        }
      }

      if (!latest) {
        console.log(`FAIL ${slug} | no 13F-HR in recent filings (${data.name})`);
        fail++;
      } else if (latest < MIN_REPORT_DATE) {
        console.log(`FAIL ${slug} | latest 13F-HR ${latest} < ${MIN_REPORT_DATE} (stale: ${data.name})`);
        fail++;
      } else {
        console.log(`PASS ${slug} | ${data.name} | ${latest}`);
        pass++;
      }
    } catch (e) {
      console.log(`FAIL ${slug} | fetch error: ${(e as Error).message}`);
      fail++;
    }
    await sleep(250);
  }

  console.log(`\n--- Summary: ${pass} PASS / ${fail} FAIL of ${candidates.length} candidates ---`);
}

main();
