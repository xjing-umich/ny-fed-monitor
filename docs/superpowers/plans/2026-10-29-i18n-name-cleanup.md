# i18n 确定性名称清洗实施计划

> **For agentic workers:** 使用 superpowers:executing-plans 在本会话执行；用户已于 2026-10-29 同意开始，不另设计划审批。

**Goal:** 修复第二轮审核中可确定的英文名称格式问题。

**Architecture:** 保持现有 `cleanIssuer`、`cleanFilerName`、`displayFundName` 接口，以显式映射和有限规则修复展示层；不修改数据库、标识符或名称来源。

**Tech Stack:** TypeScript；tsx check 脚本。

**Spec:** `web/docs/i18n-audit/round2/README.md` 批次 C 的确定性清洗部分；姓名政策、中文排序另批处理。

## Global Constraints

- 中英文各自符合 `web/docs/copy-voice.md`。
- 复用已有 i18n worktree，基于 2026-10-29 GitHub 主干 `5c351dd`。
- 无推送、提交、合并、入库或部署。
- 后续授权（2026-10-29）：用户要求 code review，无问题后提交、推送并创建 PR；不合并、不手动部署。
- 不猜测截断名，不新增通用的短词大写规则；不把品牌名替换成新的法律实体名。
- 本轮不修改人名政策、估值词表、持仓计算与 PR B 的页面结构。

## Review Focus

- 反复清洗仍保持相同结果。
- A/B/C 股份类别、ADR 和 ETF 后缀保留。
- 注册州仅清理斜杠尾缀，主体中的州名保留。
- 已策展的混合大小写和标点保留。
- 只折叠完整名称的重复，不吞掉名称内部的重复单词。

### Task 1: 公司名称大小写

**Files:** `web/src/lib/format.ts`、`web/src/lib/format.check.ts`。

**Interfaces:** 保持 `cleanIssuer(raw: string): string`。

- [x] 在现有名称用例中加入审核列出的缩写、品牌、D.R. Horton、GE；覆盖重复清洗、股份类别及 ADR。
- [x] 运行 `npx tsx src/lib/format.check.ts`，确认新增用例失败。
- [x] 补充明确的大小写映射与整名修复；不扩展名称主体。
- [x] 重跑相同检查，要求退出码 0。

### Task 2: 申报机构名称与展示入口

**Files:** `web/src/lib/format.ts`、`web/src/lib/format.check.ts`、`web/src/lib/managers/profileProse.ts`、`web/src/lib/managers/profileProse.check.ts`。

**Interfaces:** 保持 `cleanFilerName(raw: string): string`、`displayFundName(name: string): string`。

- [x] 添加州尾缀、完整名称重复、Cooperman 姓名前后顺序及策展大小写保留的用例，先验证失败。
- [x] 机构名称统一经过清洗入口；仅清除已知注册州尾缀和整段重复，混合大小写保留。
- [x] 对清洗函数和展示入口分别运行检查，要求退出码 0。

### Task 3: 验证与审核记录

**Files:** 审核报告 `web/docs/i18n-audit/round2/README.md` 追加本轮状态。

- [x] 运行格式与名称检查、相关别名/分享/报告检查、TypeScript 和 lint。
- [x] 运行仓库现有检查脚本，记录具体失败；没有统一 npm test 时使用全部 `src/**/*.check.ts(x)`。
- [x] 核对 diff：来源数据和业务计算无改动；记录 C 批剩余范围及品牌来源日期。
- [x] 按真实结果更新计划，不宣称整个 C/B 批已完成。
