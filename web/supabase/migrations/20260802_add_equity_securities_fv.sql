-- 权益证券公允价值(资产负债表时点项):us-gaap EquitySecuritiesFvNi。
-- 供估值引擎在 marks 调整生效时,把"已被剔除收益"的这部分资产同步从 EPV/AV 的资产分母
-- 里剔除(口径一致性),并作为控股集团不可评估判据的输入(spec 2026-08-02 件④)。
alter table public.company_fundamentals_periods
  add column if not exists equity_securities_fv numeric;
notify pgrst, 'reload schema';
