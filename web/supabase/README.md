# Supabase 接入(Phase A)

## 开通(任选其一)
- Vercel Marketplace: `vercel integration add supabase`(自动注入 env 到 Vercel 项目)
- 或 Supabase 控制台新建项目，拿到 Project URL 与 service_role key。

## 应用 schema
在 Supabase 控制台 SQL Editor 粘贴并运行 `web/supabase/schema.sql`(或用 supabase CLI `supabase db push`)。

## 环境变量
本地 `web/.env.local`(勿提交)与 Vercel 项目 Settings → Environment Variables 都设:
```
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>   # 仅服务端/脚本使用，勿暴露到客户端
```

## 写库
本地: `cd web && export $(grep -v '^#' .env.local | xargs) && npm run ingest`
→ 应打印每位经理人 `upserted to Supabase`。

## 验证读库
设好 env 后 `npm run dev`，打开 `/zh/managers` 与某经理人详情，数据应与之前一致(此时走 Supabase)。
不设 env 时自动回退打包 JSON。
