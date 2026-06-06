# Footer 重做 + 法务页 + Newsletter — 设计

- 日期: 2026-06-06
- 状态: 已批准
- 分支: `feat/footer-contact-form`(在已有联系表单基础上继续)

## 目标

把站点 footer 从极简 colophon 升级为对齐 ValueSider/AlphaSpread 的分栏式 footer:导航 + 法务 + 联系 + 邮件订阅,并补上一个数据展示站必需的"不隶属 SEC"免责声明。让访客能方便联系、订阅,同时建立基本法律护身。

## 范围

包含:Footer 组件重做、3 个法务页(Disclaimer/Terms/Privacy)、可用的 Newsletter(Resend Audiences)。
不含:社交链接、Limitations 单独页、群发邮件功能本身(只做收集订阅)。

## 组件与边界

```
src/components/shell/Footer.tsx        (server) — 4 栏布局 + 底部条,替换 AppShell 内联 <footer>
 ├─ ContactModal.tsx                   (已有, client) — Support 栏的 Contact Us
 ├─ NewsletterForm.tsx                 (新, client)   — Stay Updated 栏
 └─ ScrollToTop.tsx                    (新, client)   — 回到顶部按钮
src/lib/footer.ts                      — footer 文案双语字典(栏标题/订阅引导/版权/免责)
src/lib/legal.ts                       — 三个法务页双语正文(含 lastUpdated)
src/components/legal/LegalArticle.tsx  (server) — 共享排版组件
src/app/[lang]/disclaimer/page.tsx     — 引用 legal.disclaimer
src/app/[lang]/terms/page.tsx          — 引用 legal.terms
src/app/[lang]/privacy/page.tsx        — 引用 legal.privacy
src/app/api/subscribe/route.ts         (新) — Resend Audiences 写入
```

## Footer 布局

桌面 4 栏 / 移动堆叠,沿用 `--tt-*` 主题变量(深浅色适配):

| Explore | Legal | Support | Stay Updated |
|---|---|---|---|
| Home | Disclaimer | Contact Us(弹窗) | 订阅引导文案 |
| Superinvestors | Terms of Service | | email 输入 |
| Stocks | Privacy Policy | | Subscribe 按钮 |
| Macro / Liquidity | | | |

Explore 链接复用 `TOP_NAV`(lang-aware)。底部条:Compounder logo · `© 2026 Compounder · Not affiliated with the U.S. SEC or EDGAR · No investment advice` · 回到顶部。

## 数据流

- **Contact**:沿用已有 `/api/contact` → Resend 发信。
- **Newsletter**:`NewsletterForm` → `POST /api/subscribe {email, company(honeypot)}` → 校验/蜜罐 → `resend.contacts.create({ email, audienceId: RESEND_AUDIENCE_ID })` → 200 `{ok}`。未配 env → 503。重复订阅 Resend 幂等返回成功即可。

## 法务页

每页 server component,按 `lang` 渲染。正文为高质量模板:
- **Disclaimer**:非投资建议;数据来源 SEC EDGAR / NY Fed / Treasury.gov;不保证准确/时效;与 SEC/EDGAR 无隶属;教育用途、价投/复利定位。
- **Terms**:按现状提供、无担保、知识产权、风险自担。
- **Privacy**:收集项(Newsletter 邮箱存 Resend、联系表单数据、Vercel Analytics/Speed Insights)、Cookie、第三方处理者。

每页标注"最后更新 2026-06-06"。文案顶部/spec 注明属模板,正式依赖前建议律师复核。

## i18n

footer 与法务正文均中英双语,沿用现有 `lang === "zh"` / 局部 `t()` 模式(同 ContactModal)。

## 错误处理

- 表单:邮箱正则校验、长度上限、honeypot 静默丢弃、网络错误内联提示。
- 路由:缺 env 返回 503;Resend 报错返回 502;非法输入 400。

## 新增 env

`RESEND_AUDIENCE_ID` — 实现时用 Resend API 创建一个名为 "Compounder" 的 Audience,写入本地 `.env.local` 与 Vercel(Production/Development)。

## 验证

`tsc --noEmit` 通过;本地 dev 起站,footer 四栏渲染、三个法务页可达、Contact 与 Subscribe 各真实跑通一次(本项目无测试套件,人工验证)。
