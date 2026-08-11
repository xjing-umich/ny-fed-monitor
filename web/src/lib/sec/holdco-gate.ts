import type { FundamentalPeriod } from "./normalize-facts";

/**
 * 件⑤ 窄闸:只有件④会判为 holdco_not_assessable 的那类主体才走件⑤(取数侧拉 instance、
 * 读取侧查两张新表)。
 *
 * 这里用**取数侧可得的代理条件**复刻件④的触发形状(引擎侧的 holdco_not_assessable 依赖估值
 * 中间量,ingest 时算不出来):有投资性重估损益(marks 的原料)+ 全窗口无营业利润。作用域被
 * 天然框住,其余票零新增取数、零新增查询。宁可窄:漏触发只是没有 SOTP(退回件④抑制),
 * 误触发才是浪费。
 *
 * ★ 单独成模块是为了让**取数侧与读取侧共用同一个谓词**:两边各写一份必然漂移,而漂移的后果
 *   是「表里有数据但没人读」或「每票都多查两次库」。本模块刻意不 import supabase / sec-client,
 *   读取侧引它不会连带拖进取数依赖。
 */
export function needsHoldcoSotp(annual: FundamentalPeriod[]): boolean {
  if (annual.length < 3) return false;
  const hasMarks = annual.filter((p) => p.investment_fv_gain_loss != null).length >= 3;
  const noOperatingIncome = annual.every((p) => p.operating_income == null);
  return hasMarks && noOperatingIncome;
}
