/**
 * 13F 工作流最后一步(if: always()):把整次运行的结果记一行到 price_ingest_runs(run_type='13f'),
 * 供 health-watchdog 判断"最近一次成功入库"和"最近一次是否失败"。
 *
 * 记在 workflow 末尾而不是 ingest 脚本里:2026-08~10 的事故是入库成功、页面刷新 401,
 * 失败发生在 ingest 之后的步骤;只有 job.status 能覆盖全部步骤。
 * 复用 price_ingest_runs(字段本身是通用运行记录;价格看门狗只读 run_type='daily'),免一次手工迁移。
 *   rows_written  = 本次新入库的 13F 申报份数
 *   tickers_total = 成功抓取的投资人数
 *
 * 环境:SUPABASE_URL / SUPABASE_SERVICE_KEY;JOB_STATUS(job.status)、NEW_FILINGS、MANAGERS_OK、
 * STEP_OUTCOMES("ingest=success revalidate=failure …")、RUN_URL、RUN_STARTED_AT。
 * 记账失败只打日志、不让 workflow 变红(不掩盖真正的失败步骤,也不制造新的红灯)。
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    console.warn("record-ingest-run: 缺 SUPABASE_URL / SUPABASE_SERVICE_KEY,跳过");
    return;
  }
  const ok = process.env.JOB_STATUS === "success";
  const num = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null);
  const steps = process.env.STEP_OUTCOMES ?? "";
  const runUrl = process.env.RUN_URL ?? "";
  const row = {
    run_type: "13f",
    status: ok ? "success" : "error",
    rows_written: num(process.env.NEW_FILINGS),
    tickers_total: num(process.env.MANAGERS_OK),
    error_message: ok ? runUrl || null : `${steps}${runUrl ? ` · ${runUrl}` : ""}`.trim() || "job failed",
    started_at: process.env.RUN_STARTED_AT || new Date().toISOString(),
    finished_at: new Date().toISOString(),
  };
  const db = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: WebSocket as unknown as never } });
  const { error } = await db.from("price_ingest_runs").insert(row);
  if (error) console.warn(`record-ingest-run: 写入失败 ${error.message}`);
  else console.log(`record-ingest-run: ${row.status} new_filings=${row.rows_written} managers_ok=${row.tickers_total}`);
}

main().catch((e) => console.warn(`record-ingest-run: ${e instanceof Error ? e.message : e}`));
