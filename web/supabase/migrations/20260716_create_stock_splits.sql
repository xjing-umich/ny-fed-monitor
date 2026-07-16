-- stock_splits: 存 Yahoo 报告的拆股事件,供估值口径护栏判定"基本面 as-of 是否早于最近拆股"。
-- 拆股后至下一份财报落地前,SEC 侧 shares_diluted 仍是拆股前口径,而价格已是拆股后 →
-- 每股价值带被放大 ~拆股比例倍。护栏读此表把 verdict 抑制为无判定,避免假安全边际。
create table if not exists public.stock_splits (
  ticker text not null,
  split_date date not null,
  ratio numeric not null,
  primary key (ticker, split_date)
);
notify pgrst, 'reload schema';
