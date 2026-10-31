import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAllPages } from "../managers/db";
import { isOperatingSecurity } from "../securities/openfigi";

/** Filter only the corporate-fundamentals queue; holdings and prices are untouched. */
export async function selectOperatingFundamentals(db: SupabaseClient, tickers: string[]) {
  const { data, error } = await selectAllPages<{ ticker: string; security_type: string | null }>(
    () => db.from("securities").select("ticker,security_type").order("ticker"),
  );
  if (error) throw new Error(`Corporate fundamentals security classification: ${error.message}`);
  const types = new Map(data.map(row => [row.ticker.trim().toUpperCase(), row.security_type]));
  const eligible: string[] = [];
  const excluded: { ticker: string; security_type: string }[] = [];
  for (const ticker of tickers) {
    const type = types.get(ticker.trim().toUpperCase());
    if (isOperatingSecurity(type)) eligible.push(ticker);
    else excluded.push({ ticker, security_type: type! });
  }
  return { eligible, excluded };
}
