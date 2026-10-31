# A5 Landing Interactive Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; preserve the current session’s native execution workflow. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 将已认可的 A5 方向落实为可交互整页原型，验证用户能理解并使用 13F 查询与公司估值搜索。

**Architecture:** 独立静态 HTML/CSS/JS，由既有 visual companion 本地服务运行。只使用公开正式页的一次性冻结快照；搜索演示五个明确标注的对象，真实详情链接在新标签打开。无生产源码变更或服务端写入。

**Tech Stack:** semantic HTML、CSS、少量原生 JS、原生 details/dialog、现有 Geist 字体。可丢弃的交互原型以浏览器任务与边界验证为主，不为临时布局编写镜像单元测试。

**Spec:** `docs/superpowers/specs/2026-10-31-landing-redesign-design.md`

## Global Constraints

- A5 深蓝、冰蓝、少量青色；保留柔和过渡与半透明层次。56px 桌面主标题上限，手机 32–40px；正文 15px，辅助最低 12px。
- 搜索、同公司两视角、来源解释、季度动态、单一订阅入口组成整页。中英文、深浅主题、375/768/1440px、减少动态效果。
- 数据源：2026-10-31 正式页快照；报价日2026-10-30，13F真实季末快照原样标注。原型不能被说成实时行情或全站完整搜索。
- 不新建表、不改估值模型、不接抓取/入库/真实订阅接口；保留来源和正式页跳转。
- 静态原型文件全部放 `.superpowers/brainstorm/22771-1793416066/content`；该目录已忽略。不为实验原型开产品 PR。

## Review Focus

1. 未匹配查询要说明演示覆盖，不能伪造股票结果；键盘可上下选、回车打开、Escape关闭。
2. AAPL/MSFT/BRK.B 切换时公司、持仓、日期、方法身份及刻度同步，SOTP保留名称。
3. 无估值/待确认数据不画可信比较图；浮点坐标保持有限，金额不溢出。
4. 手机长名称、英文搜索结果、底部订阅反馈可读；无整页横向溢出，触控目标约44px。
5. 订阅是明确的原型反馈，不能真的发送邮件；所有金融数据带来源和日期。

### Task 1: 冻结证据与页面结构

**Files:** `prototype-snapshot.json`、`geist.woff2`、`apple.svg`、`landing-a5-v1.html`（均在上述 content 目录）。

- [x] 读取三只公司中英文正式页，保存来源 URL、捕获时间、日期、主要持有人、价格与模型范围。
- [x] 创建全页语义结构，搜索、示例、证据、季度、订阅各有明确职责，放置可读的快照说明。
- [x] 首屏使用真实可编辑的 HTML/SVG 关系图；不把生成的整页图片当网站。

### Task 2: A5 视觉与交互

**Files:** `landing-a5-v1.css`、`landing-a5-v1.js`。

**Interfaces:** JSON的`companies[ticker].locales[lang]`驱动示例；JS状态`lang`、`selectedTicker`、`theme`、搜索active index。JSON只读取一次。

- [x] 落实蓝色渐变、轻透资料层与有变化的空间节奏，默认内容可见，减少动态效果可关闭过渡。
- [x] 实现分组查询、键盘操作、五对象真实链接、无匹配提示；同步中英文和主题。
- [x] 实现案例切换、真实同尺度 SVG、来源 details、手机导航 dialog 与唯一的订阅演示反馈。

### Task 3: 原型验收与展示

- [x] 浏览器验证两类查询、无匹配、键盘、三例切换、来源展开、导航、订阅演示；不得产生真实写入。
- [x] 375/768/1440 × 中英 × 深浅主题检查无横向溢出、主要入口可达、文字清晰。
- [x] 本地截取首屏和整页检查；用受控缺数据夹具验证诚实回退。
- [x] 独立原型检查后修复阻塞问题，保留服务器和完整带 key 的 URL 供用户试用。生产实现另行制定计划。
