# 账号与估值跟踪运维

## 当前状态

账号功能默认关闭：`NEXT_PUBLIC_ACCOUNT_TRACKING_ENABLED=0`。只有值严格为 `1` 时开启；该值由 Next.js 在构建时内联，客户端和服务端共用同一开关，修改后必须重新构建并部署。导入配置模块不会创建认证客户端，关闭时不要求公开认证 key。

本次只建立本地运行时、依赖和配置基础；未修改生产 Auth 设置、发送邮件、执行数据库迁移或部署。Google 与邮箱验证码的真实验收尚未执行，不能据此开启功能。

## 上线前置条件

- Vercel 项目 Node.js Version 需先对齐 **22.x**，并确认 Preview / Production 构建日志使用 Node 22；此处只记录前置项，未修改线上设置。
- 本地在 `web` 执行 `nvm use`（`.nvmrc` 为 `22`）后运行 `npm ci`。`package.json` 的 `engines.node` 与共享 lockfile 的六个 GitHub Actions workflow 均使用 Node 22。
- 在目标环境配置 `NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`。认证仅使用这两个公开配置，不回退到 `SUPABASE_SERVICE_KEY` / `SUPABASE_SERVICE_ROLE_KEY`。
- 公开 URL 必须与服务端已有 `SUPABASE_URL` 指向同一项目；服务端在开启账号并读取认证配置时校验一致性。服务端未设置 `SUPABASE_URL` 时，现有数据层继续使用公开 URL。管理 key 仅保留在服务端。
- 开启前需完成后续账号表 / RLS、Google 与邮箱验证码配置、真实登录和退出、跨用户隔离与公开页面缓存验收；真实验收结果应追加在本文，当前未验收。
- 验收完成后才把开关设为 `1` 并重新部署。关闭也需把开关设为 `0` 后重新部署。

## 依赖依据

于 **2026-10-31** 重新读取官方 npm registry：

- [`@supabase/ssr@0.12.7`](https://registry.npmjs.org/@supabase%2fssr/0.12.7) 的 peer dependency 为 `@supabase/supabase-js: ^2.114.0`。
- [`@supabase/supabase-js@2.114.0`](https://registry.npmjs.org/@supabase%2fsupabase-js/2.114.0) 要求 `node >=22.0.0`。
- 本仓库精确固定上述两个版本；不使用 `--force` 或 `--legacy-peer-deps` 绕过约束。

Next.js 环境变量行为已按当前安装版 **16.2.6** 的 `node_modules/next/dist/docs/01-app/02-guides/environment-variables.md` 核对：公开变量必须直接读取 `process.env.NEXT_PUBLIC_…` 才会内联，构建后修改环境变量不会更新既有浏览器 bundle。

## 本地验证命令

在 `web`、Node 22 下执行：

```sh
npm ls @supabase/supabase-js @supabase/ssr
npx --no-install tsc --noEmit
npx --no-install tsx --tsconfig scripts/tsconfig.json src/lib/valuation/runValuation.check.ts
npx --no-install tsx --tsconfig scripts/tsconfig.json scripts/lib/valuationPublication.check.ts
NEXT_PUBLIC_ACCOUNT_TRACKING_ENABLED=0 npm run build
```

验收记录：本阶段尚无真实 Google / 邮箱登录、生产配置或线上验收结果。


## 2026-10-31 本地基础验证记录

- 原 lockfile / Node 20.20.0：TypeScript、两项估值检查及完整 prebuild 通过。安装已有 `mute-stream` Node engine 警告。
- 新 lockfile / Node 22.23.4：干净 `npm ci`、依赖树、TypeScript、两项估值检查、配置 eslint、完整 prebuild 通过；无 peer / engine 警告。配置烟雾验证通过：默认关闭、仅 `1` 开启、缺公开 key 不使用管理 key、服务端项目 URL 失配报错。
- `NEXT_PUBLIC_ACCOUNT_TRACKING_ENABLED=0` 公开 build 在升级前后均完成编译与 TypeScript；均在 `/[lang]/managers/[cik]` 页面数据收集阶段因缺少既有 `SUPABASE_URL / SUPABASE_SERVICE_KEY` 失败。此工作区未注入生产凭据，不能记录为完整构建通过。

## 2026-10-31 公开估值代次与自动发布

公开个股、首页、股票列表、筛选器及投资人估值区域现在读取同一发布记录；内在价值和比较锚使用记录原值，保留零增长底 / SOTP 基础档区别。个股仍读取基本面用于生意质量与研究，但不再独立运行估值。估值库缺配置、缺表或故障时，页面显示明确不可用，13F 与研究 / SEO 保留。

`VALUATION_PUBLICATION_VERIFY_ENABLED` 仍默认关闭；本次没有开启任何线上开关。真实迁移、Supabase / Google / 邮箱验收仍属于发布前置条件。待验收环境开启此开关后，ingest 和 verifier 必须同时提供：

- `VALUATION_PUBLICATION_BINDING`：受信配置 `{ "origin": "https://站点域名", "supabaseUrl": "https://对应项目.supabase.co" }`，两者由客户端工厂绑定；不要从请求或 manifest 推断。
- `VALUATION_PUBLICATION_SEED_KEYS`：私有逗号分隔证券身份键，最多 500 个。Task 7 提供活跃关注键前使用此显式种子集合；不要公开到 Actions artifacts / 日志。
- 现有服务端 Supabase 配置；verifier 另需 `INGEST_SECRET`。无需手工制作 manifest。

自动流程：在替换任何候选之前捕获完整旧投影和未完成义务；整批估值计算完毕后，用相同投影函数计算将来的路由内容、摘要和成员，持久化 intent，然后才逐条 CAS 写入。prepare 失败不写候选；中途 CAS 失败保留完整 intent，由后续 verifier 按实际状态生成继任 intent。确认仍只能经过真实公开 HTML 校验与 Task 5 SQL CAS，不能用 `/api/revalidate` 的 200 充当确认。

首次 bootstrap 保守覆盖全部当前投资人页、实际筛选器静态变体、必要汇总与个股页，包括应为空的义务。最近 20 个同源已完成 manifest 提供可信路由库存后，仅保留所选证券变更前后相关路由和全部未完成历史 URL / key 义务；不在此有界库存中的证券重新保守 bootstrap。历史未知 / 已删除路由无法凭空重建，生产器明确失败并保留旧义务，需要先解决真实路由可达性；不得靠删除 intent 放行。

股票列表的筛选 / 分页只在浏览器完成：一个 canonical `/stocks` ISR 数据集的摘要覆盖完整序列化行，SSR 只为实际首屏行标记代次。筛选器的七个视图 / 排序组合沿用原静态 rewrite，各有真实 query canonical 路径。投资人投影复用原持仓上限与估值姿态选择，摘要仍包含全部输入，不能把未渲染的溢出行冒充已验证行。

安全区域 SSR 默认“待核实”，首次可见、恢复可见、网络恢复和实际行变化时批量请求 `/api/valuation/state`；每批最多 100 证券、`credentials: omit`，无逐行轮询。API 不读 / 写用户 Cookie，响应 `no-store`。网络失败或撤回保留带日期历史数字并关闭确认状态；重新联网只是核对触发器。

本地验证仅使用合成 PostgREST 数据和独立端口的 Next 生产构建 / `next start`，没有复用生产 `.env`。完整 `npm run build` 已通过（含 prebuild），公开页面仍为静态 / SSG，只有安全 API 按请求读取。真实 Supabase、Google、邮箱登录与部署验收尚未执行。

实际 `next start` 失效重建另发现：publication revalidate 必须把公开筛选 query 映射到内部 `/en|zh/stocks/screener/<variant>`，不能丢掉 query 后只刷新默认页。Next 16.2.6 对该路由 `dynamicParams=false` 在干净构建后按路径或路由族失效都会产生 `NoFallbackError` / 404，因此仅该路由允许 ISR fallback；仍预生成六个合法 variant，严格 `parseVariant` 白名单、未知 variant 404、259200 秒 ISR 不变。普通公开 GET 的真实重建与 HTML 代次校验仍是确认条件。
