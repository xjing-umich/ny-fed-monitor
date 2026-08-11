-- 件⑤ 控股集团分部 SOTP(spec 2026-08-10)。
-- 两张表都只由 ingest 的窄闸(件④ holdco_not_assessable 触发集)写入,通用 fundamentals
-- 路径完全不碰 —— 刻意不给 company_fundamentals_periods 加列,以规避件③④两次踩到的
-- 「加列→周六全量 upsert 遇未知列整批 throw 断更」运维顺序风险。

-- 第一栏:投资按市值。逐项存原始成分而非只存合计,供页面拆解与人工审计。
create table if not exists public.company_holdco_investments (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  cash numeric,                    -- 只取「保险与其他」列,不含铁路能源经营现金/受限现金
  treasuries numeric,              -- USTreasuryBills 及同族短期国债
  equity_securities numeric,       -- EquitySecuritiesFvNi
  equity_method numeric,           -- EquityMethodInvestments
  afs_debt numeric,                -- AvailableForSaleSecuritiesDebtSecurities
  total numeric,
  unrealized_gain numeric,         -- 递延税基数
  gate_attribution_ok boolean,     -- 各列现金之和 ≈ 合并现金
  gate_closure_ok boolean,         -- 各 ProductOrService 的 Assets 之和 ≈ 合并 Assets
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period)
);

-- 第二、三栏:分部税前利润与实际税额。
create table if not exists public.company_segment_periods (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  segment_member text not null,    -- localName,如 BurlingtonNorthernSantaFeCorporationMember
  segment_label text,
  kind text not null,              -- insurance_underwriting | insurance_investments | operating | corporate
  pretax_income numeric,
  income_tax numeric,
  revenue numeric,
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period, segment_member)
);

create index if not exists company_segment_periods_ticker_idx
  on public.company_segment_periods (ticker, period_end desc);

notify pgrst, 'reload schema';
