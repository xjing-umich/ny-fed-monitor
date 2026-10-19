# 季度报告与 newsletter 上线手册

> 对应 spec：`docs/superpowers/specs/2026-10-19-filing-season-report-engine-design.md`
> 下列步骤都会动到生产环境（Supabase、Resend、GitHub Secrets、Vercel），由站长亲自执行。代码里没有任何一步会自动群发。

## 一、合并前后一次性准备

1. **执行迁移**：在 Supabase SQL Editor 运行 `web/supabase/migrations/20261019_create_quarterly_reports.sql`，然后验证：
   ```sql
   select upsert_live_report('1999-12-31','{}'::jsonb,'h',0,0,null);  -- 期望 'inserted'
   select upsert_live_report('1999-12-31','{}'::jsonb,'h',0,0,null);  -- 期望 'unchanged'
   delete from quarterly_reports where period = '1999-12-31';
   ```
2. **建 Resend Segment**：建 `Compounder EN`、`Compounder ZH` 两个，另建一个只含站长自己邮箱的 `Compounder TEST`（彩排用，可选但强烈建议）。
3. **配置变量**：
   - Vercel：`RESEND_SEGMENT_EN_ID`、`RESEND_SEGMENT_ZH_ID`（订阅接口用）。
   - GitHub Secrets：`RESEND_SEGMENT_EN_ID`、`RESEND_SEGMENT_ZH_ID`、`RESEND_SEGMENT_TEST_ID`、`RESEND_AUDIENCE_ID`、`RESEND_AUDIENCE_API_KEY`。确认已有 `RESEND_API_KEY`、`RESEND_ALERTS_TO`、`INGEST_SECRET`、`SUPABASE_URL`、`SUPABASE_SERVICE_KEY`。
   - 可选：`NEWSLETTER_REPLY_TO`、`NEWSLETTER_POSTAL_ADDRESS`（是否放通讯地址由站长判断，见 spec §5.3）。
4. **老订阅者归组**：
   ```bash
   cd web && npx tsx scripts/newsletter-backfill-segment.ts
   ```
   先只看数量，确认无误后加 `--apply`。群发前如果有未分组的订阅者，发送流程会直接拒绝并提示重跑这一步。

## 二、Q2 彩排（约 11/6 前）

1. 生成 Q2 报告行：`cd web && npm run report -- --period=2026-06-30`，再跑一次，应显示 `unchanged`。
2. 一致性核对：`npm run report:consistency -- --period=2026-06-30`。如果提示 cohort 不同，下面列出的差异属于正常现象，逐项看一眼即可。
3. 预览与彩排：
   - GitHub → Actions → Report finalize & send，`period=2026-06-30`、`action=preview`。
   - 再跑一次：`action=finalize`、`dry_run=true`。配置了 TEST segment 时，dry-run 会走真实 broadcast，可以顺带检查退订链接。
   - 在 Gmail 和 Apple Mail 里检查：中英结论句、表格、链接、“中文版”链接、首期句、免责声明、退订链接。
4. **Q2 只定稿不群发**：在 SQL Editor 运行 `select finalize_report('2026-06-30');`，再刷新报告页缓存：
   ```bash
   curl -X POST "https://thecompounder.fyi/api/revalidate?source=report" -H "Authorization: Bearer $INGEST_SECRET"
   ```
   发送流程会拒绝群发旧季度，误填 `period=2026-06-30` 也发不出去。
5. 在桌面和 375px 宽度下检查 `/learn/q2-2026-superinvestor-consensus` 和 `/zh/...`。

## 三、Q3 上线节奏

| 时间 | 发生什么 | 站长要做的 |
|---|---|---|
| 合并部署后 | 下一次 ingest 为 Q3 建 live 行（已有早申报者时） | 打开 `/learn/q3-2026-superinvestor-consensus` 看一眼 |
| 11/10–11/20 | 每天 ingest + 报告刷新（与周一、四的 cron 串行，不会并发） | 无 |
| 11/17 起，覆盖率 ≥ 90% | 系统给站长发中英两封预览（截止日 11/14 是周六，顺延到 11/16，所以 11/17 起才算可定稿） | 审预览 |
| 审完 | — | Actions → Report finalize & send：`period=2026-09-30`、`action=finalize` |
| 想用更新的数据 | — | 先跑 `action=preview` 生成新预览，再 finalize |
| 发送后 | 报告页自动刷新；刷新失败时 workflow 会变红，重跑只补刷新、不会重复群发 | 待全站切到 Q3 后跑 `npm run report:consistency -- --period=2026-09-30` |
| 截止 + 10 天仍未定稿 | 看门狗发提醒 | 按提醒操作 |

## 四、出问题时

- **workflow 红灯**：直接重跑同一参数即可。已发出的语言会核实后跳过，不会建第二个 broadcast。
- **提示“broadcast 已发出，请手动补记”**：不要重跑该语言。到 Resend 后台确认状态后，在 `quarterly_reports.sends` 里补上 `sentAt`。
- **Resend 后台留下的 `-dryrun` 或孤立草稿**：可以手动删除，不影响订阅者。
