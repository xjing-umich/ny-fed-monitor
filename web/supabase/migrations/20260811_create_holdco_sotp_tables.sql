-- 件⑤ 控股集团分部 SOTP(spec 2026-08-10)。
-- 三张表都只由 ingest 的窄闸(件④ holdco_not_assessable 触发集)写入,通用 fundamentals
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
  gate_upper_bound_ok boolean,     -- 第一栏合计 ≤ 投资列自身的 Assets(防重复计入经营业务资产)
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period)
);

-- 第二、三栏的**年度级**聚合量。引擎(computeHoldcoSotp)只吃这一层,故它们有自己的真列与
-- 自己的主键粒度(一年一行),不再重复塞进每条分部明细行的 raw_facts —— 那样既让读取侧被迫
-- 从 jsonb 反解析,又没有任何约束保证同一年各行的值一致。
create table if not exists public.company_segment_years (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  total_pretax numeric,            -- 全部经营分部税前合计(申报的合计行)
  total_tax numeric,
  insurance_pretax numeric,        -- 保险集团合计
  insurance_tax numeric,
  underwriting_pretax numeric,     -- 保险承保(第三栏基数)
  investments_pretax numeric,      -- 保险投资分部(属第一栏的收益,任何一栏都不得计入)
  segments_pretax_sum numeric,     -- Σ 顶层分部税前,与 total_pretax 构成对账恒等式
  source_url text,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period)
);

-- 第二、三栏的逐分部明细:kind 分类落库,供页面展示与人工审计(spec §2.1)。
-- 刻意不设 revenue 列 —— SOTP 公式不吃分部营收,取数侧也从不写它。
create table if not exists public.company_segment_periods (
  ticker text not null,
  period_end date not null,
  fiscal_period text not null,
  segment_member text not null,    -- localName,如 BurlingtonNorthernSantaFeCorporationMember
  segment_label text,
  kind text not null,              -- insurance_underwriting | insurance_investments | operating | corporate
  pretax_income numeric,
  income_tax numeric,
  raw_facts jsonb,
  updated_at timestamptz not null default now(),
  primary key (ticker, period_end, fiscal_period, segment_member)
);

create index if not exists company_segment_periods_ticker_idx
  on public.company_segment_periods (ticker, period_end desc);

create index if not exists company_segment_years_ticker_idx
  on public.company_segment_years (ticker, period_end desc);

notify pgrst, 'reload schema';
