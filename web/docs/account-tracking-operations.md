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
