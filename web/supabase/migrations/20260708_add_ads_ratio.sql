-- 每 1 ADS 折合几股标的普通股(ordinary shares per ADS)。
-- 仅 security_type='ADR' 行有意义;NULL=未策展→估值层对该 ADR 抑制(不显示未归一化的错带)。
-- 非 ADR(Common Stock / NY Reg Shrs)天然 1:1,不读此列。
alter table securities add column if not exists ads_ratio numeric;

comment on column securities.ads_ratio is
  'Ordinary shares per 1 ADS (ADR only). NULL => valuation suppressed for that ADR.';
