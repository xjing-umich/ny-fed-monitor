-- 投资性重估损益(税前,GAAP 利润表行):GainLossOnInvestments / EquitySecuritiesFvNiGainLoss。
-- 供估值引擎把 marks 主导型公司(BRK/MKL 等)的盈利基数还原为经营口径(spec 2026-07-26 件③)。
alter table public.company_fundamentals_periods
  add column if not exists investment_fv_gain_loss numeric;
notify pgrst, 'reload schema';
