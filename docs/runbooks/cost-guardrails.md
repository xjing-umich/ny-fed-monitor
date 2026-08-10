# 成本护栏运行手册

站点自动运转，成本悄涨是唯一能无声搞垮它的东西。三路防线：两路平台原生告警（一次性配置）+ 一路 watchdog 早警（已随代码上线）。

## 1. Vercel — Spend Management（配置）

Dashboard → 选团队 → Settings → Spend Management：
- 设一个月度金额上限（建议对齐"营收覆盖成本"靶，如 $20/月）。
- 确认通知邮箱是你常看的地址。
- Pro 默认已开 50/75/100% 邮件+web 告警，确认阈值即可。

## 2. Supabase — Spend Cap + 账单邮箱（配置）

Org → Billing：
- 确认 **Spend Cap** 开启（Pro 默认开；开着=超额即停增用量，不产生意外账单）。
- 确认账单/告警邮箱是常看地址。

## 3. Supabase DB 体积 — watchdog 80% 早警（已上线，需部署迁移）

- 迁移 `20260725_db_size_rpc.sql` 部署后自动生效（`db_size_bytes()` RPC）。
- watchdog 日跑时，DB 体积达 `SUPABASE_DB_LIMIT_MB × DB_WARN_FRACTION`（默认 500MB × 0.8 = 400MB）→ 发 Resend 邮件早警。
- 换套餐只改 env（免费 500 / Pro 8192），不改码。
- 与周清 prices（`prices-cleanup.yml`）互补：清理失灵或增长跑赢时，这条早警兜底。

## 4. 邮箱对齐

Vercel spend 通知 + Supabase 账单告警 + watchdog `RESEND_ALERTS_TO` → 指向**同一个常看邮箱**，否则告警发了没人看等于没有。

## 验证

- 部署迁移后：`GET /api/cron/health-watchdog?dryRun=1` → 返回 JSON 的 `info` 应含一行「DB 体积 X MB / Y MB (Z%)」（或超阈时 `problems` 里的 cost 条目）。
