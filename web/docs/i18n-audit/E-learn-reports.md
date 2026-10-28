# E-learn-reports：学习文章与季度报告 文案审核

审核范围：`src/lib/learn.ts`（7 篇文章 × 中英 + BRAND 块）、`src/app/[lang]/learn/**`（索引页、文章页、两个 OG 图）、`src/lib/reports/{copy,build,read,types}.ts`、`src/components/reports/ReportArticle.tsx`。
`build.ts / read.ts / types.ts` 里没有面向用户的字符串（只有 console 错误信息和类型），不出条目。`email.ts` 不在本区范围内，没有审。
行号均指当前工作区文件。下表中的文章内链 token（`[[stock:X|Y]]`）为了不打断表格省略了，替换时保留原 token。

---

## 1. 区域概况

**英文一侧是原文，中文一侧是译文，7 篇无一例外。** 英文长文整体水准高，平实、有主张、数字具体，`copy-voice.md` 里的北极星句大半就出自这里（"Treat a 13F as a lead, not an answer."、"A stock twenty funds own is not therefore cheap…"、"UnitedHealth is the one worth slowing down on."）。中文是逐句对译出来的：英文每句话、每个比喻、每个从句在中文里都有对应，连英文的段落节奏也照搬。所以中文读起来"意思都对，就是不像中国人写的"。季度报告是模板拼出来的，中英两侧同样一一对应，问题集中在内部口径外露和拼接后的句子。

最主要的 3 个问题模式：

1. **英文习语和英文句法直接搬进中文（Z1/Z4），是"AI 味、生硬"的主因。** 典型：「这件事，你能从公司财报里的几个数字走出很远」（get a long way toward）、「它是对定价权最快的一眼」（the quickest read on）、「把它当成一份阅读清单，由一群读得很仔细的人开出来的」（后置定语）、「当一打人持有同一只股票」（a dozen）。还有一批高频口癖：「名字」（name，指股票）出现 14 次，「被持有/买/减得最广」（widely held/bought）6 次，「只字不提/只字未提」（says nothing about）5 次。
2. **中文页上排版和术语系统性不统一（Z5/X1/X4）。** 文章正文几乎全用半角标点（`,` `:` `(` `?` 共约 600 处），而 Q1/Q2 的标题和描述、Learn 索引页、季度报告都用全角，同一页面上两种标点混排。中文正文里 Microsoft、Apple、Amazon、Visa 保留英文，台积电、伯克希尔却译成中文，同一篇 Q2 里 "Berkshire Hathaway" 和「伯克希尔」各出现一次。同一批人一会儿叫投资者，一会儿叫投资人、机构、基金、经理、家；季度标签有「2026 Q1」和「Q2 2026」两种写法。
3. **季度报告模板把工程口径直接给用户看（Z2/E3），英文模板拼出来有不通的句子（E1/X3）。** 典型：「价值位置按 … 收盘价计算（晚于该季申报季）」、「方法与口径」、「避免…造成虚降」、「覆盖率达标后…定稿冻结」；英文拼出来是 "Warren Buffett: Shares down AAPL (portfolio weight 28% → 22%)"、"94 of the 97 superinvestors … (3 more missed last quarter and aren't counted)"，后者把剩下的 3 位说成了"另外 3 位"。

另有一个跨文章的结构问题：**7 篇文章全部用同一种结尾收束**，即"以上都不是投资建议，判断留给你"（The looking is still up to you / the deciding is yours / is yours alone / a question only you can answer…）。单篇读没问题，连着读就是模板。

**风格锚点（值得表扬，改写时照这个声音写）：**
- EN 全篇 `how-to-read-a-13f`、`reading-cross-fund-consensus` 的 "Why consensus can mislead" 一节，Q2 的 "Holder count and dollars can tell different stories…By dollars it is mostly one investor's position."
- ZH 里少数本来就像中文的句子：「按家数数，Apple 是共识股；按金额看，它基本是一家的仓位。」「先说结论：三张榜的前排几乎是同一批大市值公司，而卖出一侧大多是减仓，很少有人真的走人。」「段永平更冲：要用计算器才算得出来的便宜，就不够便宜。他把自己的路子叫『毛估估』」「一张精细的表格看着严谨，其实是在一堆对未来的猜测上，又刷了一层虚假的精确。」

### 逐篇评级

| 文章 | 原文侧 | EN 评级 | ZH 评级 | 一句话 |
|---|---|---|---|---|
| how-to-read-a-13f | EN | A | B | 中文大体通顺。「首先/其次/最后」脚手架违反 content-voice；「严肃投资者」「信念」「私人持仓」是直译。 |
| what-is-a-superinvestor | EN | A | B | 中文「特定的…特定的」「把这些想法变成了自己的东西」「底下那套纪律」「任何程度的频繁交易」，都能看出英文底稿。 |
| reading-cross-fund-consensus | EN | A−（第 216 行一句英文不通） | B（接近 C） | 翻译腔最密的一篇：一打、一个高持有人数、坐同样的会、后置定语、句尾挂「——在你…之后」。 |
| q1-2026-superinvestor-consensus | EN | A | B | 「被持有得最广」「名字」「卖出一侧」「共识凑近了看的样子」「没有一个数字告诉你任何人…」。 |
| q2-2026-superinvestor-consensus | EN | A−（186 个组合的说法有误、正文混入 ISO 日期） | B | 中文这篇反而有几句比英文好；问题在于 位/家 量词混用、中英公司名混用，快照说明把工程口径给用户看。 |
| reading-business-quality | EN | A− | **C** | 中文整体生硬，要重写：「走出很远」「对定价权最快的一眼」「一种看法的方法」「评级特许经营」「同一个形状」「一次放行」。 |
| what-is-intrinsic-value（门面文） | EN 骨架，中文是吸收了段永平中文原话的改写 | B | B | 两侧都有悬空指代（"that 1999 Sun Valley talk"、"The four-concept version"，前文都没交代）；英文开头是 AI 式短句加路标句；中文比英文多一句（X2）。 |
| 季度报告模板（reports/*） | 两侧并行模板 | B− | B− | 工程口径外露，英文拼出来有不通的句子，与站内其他页面术语不一致。 |

---

## 2. 术语清单

| 概念 | 当前中文 | 当前英文 | 一致？ | 建议 |
|---|---|---|---|---|
| 被追踪的人 | 超级投资者 / 投资者 / 投资人 / 机构 / 基金 / 经理 / 管理人；量词 位/家/个 混用 | superinvestors / investors / funds / managers | 否（两侧都乱，中文更严重） | 中文：称人用「投资人」（与 Q2、报告一致），量词一律「位」；说组合时用「个组合」。英文：正文 investors，表格列名用 Investors（不用 Funds），因为名单里有 Berkshire 和家族办公室，并不都是 fund。 |
| 共同持有这个概念 | 共识 / 跨基金共识 / 共识持仓 / 跨机构共识（首页） | consensus / cross-fund consensus / Consensus holdings | 否 | 页面名统一用「共识持仓 / Consensus holdings」。正文解释时用大白话「同时持有某只股票的人数」。「跨基金共识」只保留在文章标题里，或者改成「多位投资人同时持有」。 |
| 最多人买 / 卖榜 | 最多买入 / 最多卖出（文章快照提示、Q2 正文）；最多人买 / 最多人卖（榜单页标题）；共识买入 / 共识卖出（报告） | Top buys / Top sells；Consensus buys / sells（报告） | 否 | 跟榜单页一致：「最多人买 / 最多人卖」「Top buys / Top sells」。报告小节同样改用这两个名字。 |
| 持有人数 | 持有人数 / 持有家数 / 家数 / 人数 | holder count / Holders / Funds | 否 | 「持有人数」+「位」；英文 Holders。 |
| 季度标签 | 「2026 Q1」（文章）/「Q2 2026」（报告标题、快照提示，quarterLabel 不分语言） | Q1 2026 | 中文侧不一致 | 中文统一「2026 Q2」或「2026 年二季度」，quarterLabel 按 lang 分开输出。 |
| 公司名 | Microsoft、Apple、Amazon、Alphabet、Meta、Visa、Mastercard、Moody's 用英文；台积电、伯克希尔用中文；Berkshire Hathaway 在 Q2 同一篇里中英各出现一次 | 英文名 | 中文侧不一致 | 中文正文首次出现写「微软（MSFT）」，之后只用中文名：微软、苹果、亚马逊、谷歌母公司 Alphabet、Meta、Visa、万事达、穆迪、伯克希尔、联合健康、台积电。related 标签也照此统一。 |
| 指股票的 "name" | 名字 / 大名字 | name / big names | — | 中文改成「股票 / 公司 / 大盘股 / 巨头」，不用「名字」。 |
| 击球区 | 击球区（报告里没有解释） | strike zone | 一致 | 保留，但报告第一次出现时用括号解释一次：「击球区（现价比内在价值低出一截安全边际）」/ "strike zone (price below value by at least our margin of safety)"。 |
| 价值带 | 价值带 / 一条带（内在价值文）/ 保守价值区间 | value band / band / conservative valuation range | 否 | 「价值区间 / value range」。如果站内其他地方坚持用「价值带」，文章里也要写全称，不写「一条带」。 |
| 估值位置 | 价值位置 / 估值位置（同一个函数里两种说法）/ 位置（列名） | Valuation positions / Position | 否；英文 position 还会被误读成"持仓" | 「相对价值 / Price vs. value」。 |
| 动作 | 动作 / 主要动作 / 名家动作 / 共识动作 | moves / Main move | — | 中文用「买卖 / 主要操作」；英文 "Most common move"。 |
| FCF margin | FCF 利润率 | FCF margin | 一致，但中文混入缩写 | 「自由现金流率」，首次出现时括注 FCF margin。 |
| ROE vs return on capital | 小标题「资本回报率」，正文讲 ROE | 小标题 "Return on capital"，正文讲 ROE | 小标题和正文对不上 | 小标题改成「净资产收益率（ROE）…」/ "Return on equity, and why it misleads"。 |
| 更新日期标签 | 更新于（索引）/ 最后更新（文章页） | Updated / Last updated | 中文不一致 | 统一「更新于」。 |
| 内在价值文章链接 | 报告里的链接写「什么是内在价值 →」，文章标题是「一只股票到底值多少钱」 | "What is intrinsic value →" vs "What Is a Stock Actually Worth?" | 链接文字和标题不符 | 链接文字用标题原文。 |

---

## 3. 逐条发现表

### 3a. Learn 索引页 / 文章页 UI / BRAND

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| app/[lang]/learn/page.tsx:32 | P0 | Z4 | zh H1「读懂生意，而非代码」 | 「代码」没有限定，读者第一反应可能是程序代码；「而非」书面又生硬。 | 「读懂生意，别只盯着股票代码」 |
| app/[lang]/learn/page.tsx:33 | P0 | Z1 | zh intro / meta description「像严肃投资者那样读懂生意的大白话指南。」 | 一长串定语，「严肃投资者」直译自 serious investors。 | 「用大白话讲清楚：顶尖价值投资者是怎么看一门生意的。」 |
| learn.ts:873 | P1 | Z1/Z4 | zh BRAND「我们把超级投资者的 13F 和估值归到一处、做得可读，判断留给你。」 | 「归到一处、做得可读」逐字对应 into one place and keep it readable。 | 「我们把超级投资者的 13F 持仓和个股估值放在一处，整理成一眼能看懂的样子；怎么判断，留给你自己。」 |
| app/[lang]/learn/[slug]/page.tsx:97 vs page.tsx:36 | P2 | X1 | 文章页「最后更新」，索引页「更新于」 | 同一字段两种叫法。 | 两处都用「更新于」 |
| app/[lang]/learn/[slug]/page.tsx:103 | P2 | Z5 | 「← 返回 学习」 | 中文词之间多了空格。 | 「← 返回学习」 |
| app/[lang]/learn/[slug]/page.tsx:215 | P1 | X1/X3/Z5 | zh 快照提示（拼接后）：「季度快照：Q2 2026 的 13F 申报（截至 2026-06-30），写于 2026-10-19。文中的家数指当时追踪的投资人。最新一季见：共识持仓 · 最多买入 · 最多卖出。」 | 季度写成英文语序；「家数」配「投资人」，量词错配；「最多买入/卖出」和榜单页标题「最多人买/卖」不一致。 | 「这是 2026 Q2 的季度快照（报告期截至 2026-06-30，写于 2026-10-19），文中人数按当时追踪的投资人计。最新一季请看：共识持仓 · 最多人买 · 最多人卖。」 |
| app/[lang]/learn/[slug]/page.tsx:216 | P2 | E5 | en "Snapshot: Q2 2026 13F filings (quarter ended 2026-06-30), written 2026-10-19. Counts refer to the investors Compounder tracked at the time." | 能看懂，但读起来像一份元数据清单。 | "A snapshot of Q2 2026 13F filings (quarter ended June 30), written October 19, 2026. Counts reflect the investors we tracked then. For the latest quarter: " |

### 3b. 跨文章的系统性问题

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts 全部 zh 正文（如 84、105、641、657、665、802） | P1（标题处 P0） | Z5 | 正文用半角 `, : ( ) ?`，约 600 处；Q1/Q2 标题与描述（356、358、493、498）、索引页、报告用全角 | 同一页面全角半角混排，中文读者一眼能看出来；标题「什么是超级投资者?」用的是半角问号。 | 中文正文全部改全角 `，：（）？；`。建议在 `ai-check` 里加一条规则：CJK 字符相邻的半角标点直接报错。 |
| learn.ts:90、253、642、656、664 等 | P2 | Z5/X1 | 引号有 `\"共识\"`、「共识」、`'质量'`、`'股东盈余'` 四种写法 | 引号样式混用。 | 统一「」（Learn 已多数使用）。 |
| learn.ts（zh 的 Q1、Q2、business-quality） | P1 | X4/X1 | 正文「Microsoft 是…」「Apple 在这批投资人里…」「Amazon 同口径下…」；同一篇又写「台积电」「伯克希尔」；557 related「伯克希尔」，832 related「Berkshire Hathaway」 | 中文读者习惯说微软、苹果、亚马逊；现在中英混用，像没翻完。 | 首次出现写「微软（MSFT）」，之后只写「微软」；按术语清单统一，related 标签同步。 |
| learn.ts 7 篇的结尾段（72、156、241、339、474、613、755） | P1 | E2/Z3 | 每篇都以"以上不是投资建议，判断/决定/研究还得你自己来"收尾 | 结尾模板化，连着读就是 AI 套路。 | 免责声明交给页面组件（ProseDoc 底部固定一行），文章停在最有力的那句具体论断上。比如 13F 一篇停在 "The looking is still up to you." 就够了，business-quality 停在 "What you pay decides that." |
| learn.ts 中文「名字」×14、「最广」×6、「只字不提/未提」×5 | P1 | Z4 | 「Microsoft 是本季被买得最广的名字」「大名字里一边倒的是 Apple」「对价格只字未提」 | name、widely、says nothing about 都是英文口癖的直译。 | 「名字」改成「股票 / 公司 / 巨头」；「被买得最广」改成「买的人最多」；「只字不提」改成「看不出 / 不告诉你」。 |
| learn.ts:303/435、367/505 | P2 | Z7 | Q1、Q2 的 "What we're reading" 第一段逐字相同 | 系列文章复制粘贴开头。 | Q2 只留一句：「数据来自各投资人的 Q2 Form 13F，读法见《如何读懂 13F》。」 |

### 3c. how-to-read-a-13f

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:84 | P1 | Z1 | zh「一份 13F 能告诉你不少东西，让你看到严肃投资者怎么布局；但要是照单全收，它也会把你带偏。所以先搞清楚你看到的到底是什么。」 | 「严肃投资者」直译；前后半句是英文 can… It can also… 的对称结构。 | 「从一份 13F 能看出一位认真的投资人大致怎么布局；可要是照单全收，也很容易被带偏。所以先弄清楚，你手里这份文件到底是什么。」 |
| learn.ts:96 | P1 | Z1/Z4 | zh「这页上最有用的数字是仓位大小。…仓位是投资者表达信念的方式，权重把它直接摆在你面前。」 | 「这页上」对应 on the page，「表达信念」对应 conviction，都是直译。 | 「13F 里最有用的数字是仓位大小。占组合 10% 的股票是真下了注；占 0.2% 的零头，多半说明不了什么。一个人有多看好，看他押了多少就知道。」 |
| learn.ts:104–105 | P1 | Z1 | zh「首先，它最多能滞后 45 天。…其次，它只显示多头。…最后，它只是某一天的照片」 | content-voice 明确禁用「首先…其次…最后」这类脚手架；英文原文本来用的是 For one thing / also / And。 | 去掉序数词：「它最多会晚 45 天：机构在季末后有 45 天申报期，你看到的仓位可能已是几周甚至几个月前的。」「它也只有多头……」「它还只是一张某一天的快照……」 |
| learn.ts:105 | P1 | X2 | zh「一只看起来是重仓押注的股票，实际上可能是拿来对冲别的东西的。」 | 英文说的是这笔多头本身可能被别处的空头对冲掉了（is hedged），中文却说这只股票是拿来对冲别的东西的（is the hedge），方向说反了。 | 「一只看似重仓押注的股票，背后可能有一笔看不见的空头在对冲它。」 |
| learn.ts:105 | P2 | Z4 | zh「私人持仓」 | private holdings 的直译，中文不这么说。 | 「非上市股权」 |
| learn.ts:111 | P2 | Z1 | zh「为什么一个想得明白的人会持有它，我对这门生意的理解，够不够我自己下判断？」 | 多余的「一个」；后半句「我对…的理解，够不够我自己下判断」绕口。 | 「一个明白人为什么会拿着它？这门生意我看得懂吗，能不能自己下判断？」 |

### 3d. what-is-a-superinvestor

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:163 | P0 | Z5 | zh 标题「什么是超级投资者?」 | 标题用了半角问号，这是 SEO 标题。 | 「什么是超级投资者？」 |
| learn.ts:168 | P1 | Z1 | zh「它指向价值投资里一条特定的传统，以及一种看待生意、价格和时间的特定方式。」 | a particular… a particular 直译成两个「特定的」。 | 「它说的是价值投资里的一支传统，以及这支传统看生意、看价格、看时间的一套办法。」 |
| learn.ts:180 | P1 | Z1/Z7 | zh「…而且你该给自己留出安全边际，这样即使只是大致看对，在部分看错时也不至于伤筋动骨。」 | 照搬了英文的嵌套从句，中文读起来逻辑打结。 | 「…还要给自己留足安全边际，这样哪怕判断有几分偏差，也伤不了筋骨。」 |
| learn.ts:181–182 | P1 | Z1/Z4 | zh「巴菲特在这之上往前走。」「此后不少投资者把这些想法变成了自己的东西。他们争论的地方很多，但底下那套纪律是一样的。」 | built on that、made them their own、the discipline underneath，逐个直译。 | 「巴菲特接过这套东西，又往前走了一步。」「后来不少投资人各自发展出了自己的打法，彼此分歧不少，守的却是同一套纪律。」 |
| learn.ts:188–189 | P1 | Z4 | zh「让他们与众不同的，主要是性情，而不是智力。」「把真金白银押在最看好的几个想法上」 | What sets them apart 直译；ideas 译成「想法」，中文里押注的对象应该是公司。 | 「他们胜出，靠的多半是定力，不是智商。」「把真金白银押在最看好的几家公司上」 |
| learn.ts:195 | P2 | Z4 | zh「效果能胜过几乎任何程度的频繁交易」 | 「任何程度的频繁交易」不是中文搭配。 | 「比怎么折腾交易都强」 |

### 3e. reading-cross-fund-consensus

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:216 | P1 | E1 | en "Hold the same name as two or more of them and the stock shows up on the Stocks page, ranked by that holder count." | 主语错了：按字面意思是"你和他们持有同一只股票"，英文不通。 | "If two or more of them hold it, the stock shows up on the Stocks page, ranked by holder count." |
| learn.ts:250 | P0 | Z1/Z7 | zh description「哪些股票被最多超级投资者同时持有——这种重叠能告诉你什么、又会在哪里骗你，以及怎样把跨基金共识当作研究起点，而不是买入信号。」 | SEO 描述用了被字句和破折号，句子过长，还带自造词「跨基金共识」。 | 「很多超级投资者同时持有同一只股票，能说明什么、会在哪儿误导你，以及怎么把它当研究起点，而不是买入信号。」 |
| learn.ts:253 | P1 | Z1 | zh「数字高，看上去像个强信号。有时候确实是，但更多时候它没看起来那么重，而能不能分清这点，正是它大半的价值。」 | 「它大半的价值」指代不清：指数字？指共识？ | 「人数一高，看着像强信号。有时候确实是，更多时候没那么有分量。能分清这两种情况，这个数字才有用。」 |
| learn.ts:259 | P2 | Z1 | zh「一位名气大的投资者持有某样东西，告诉你的是关于他这一个人的事」 | tells you about that one investor 的直译。 | 「一位名人持有一只股票，说明的只是他本人怎么想」 |
| learn.ts:266 | P1 | Z1 | zh「共识最好用的时候，是当成筛子，而不是判决。…把它当成一份阅读清单，由一群读得很仔细的人开出来的。」 | 英文后置定语原样搬进中文，翻译痕迹最明显的句子之一。 | **改写示范：**「共识适合当筛子用，别当判决书。美股上市公司好几千家，一群各做各功课、又都很认真的投资人反复回到同几家公司，这份短名单能帮你决定先研究谁。说白了，它是一份书单，而开书单的人读书很仔细。」 |
| learn.ts:272 | P1 | Z1 | zh「一个高持有人数能从好几个方向骗到你」 | 多余的「一个」，名词化直译。 | 「持有人数高，可能从好几个方面误导你」 |
| learn.ts:273 | P1 | Z1/Z4 | zh「…他们里很多人读同样的信、坐同样的会、出自同样那几家公司。当一打人持有同一只股票，你看到的可能是一个好点子传开了，而不是一打各自独立的点子。」 | 「一打」「坐同样的会」「读同样的信」都是英文搭配。 | **改写示范：**「这些投资人也没有数字显示的那么独立。不少人读同样的股东信，去同样的投资大会，甚至出自同几家老东家。十几个人同时拿着一只股票，很可能只是一个好主意在圈子里传开了，不是十几个人各自想到了一起。」 |
| learn.ts:274 | P2 | Z4 | zh「其中一些人，可能早就出来了。」 | be out 直译成「出来了」，意思不明。 | 「其中有人可能早已清仓。」 |
| learn.ts:275 | P2 | Z4 | zh「而且，扎堆这件事，对价格只字未提。」 | 拟人化直译。 | 「而且，扎堆说明不了价格高低。」 |
| learn.ts:282 | P2 | Z1 | zh「正在买入的是不是你尊重其思路的人」 | 用了「其」。 | 「在买的，是不是你佩服的那几位」 |
| learn.ts:283 | P1 | Z1 | zh「…是个只有你能回答的问题——在你自己搞懂了那门生意之后。」 | 英文 once… 从句挂在句尾，中文用破折号硬接上去。 | 「共识让你看到认真的投资人都在看哪里。至于哪只该进你自己的组合，得等你自己弄懂了那门生意，才答得上来。」 |

### 3f. q1-2026-superinvestor-consensus

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:356 | P0 | Z4 | zh 标题「2026 Q1：超级投资者持有、买入与卖出了什么」 | 「持有、买入与卖出了什么」把三个动词并列，「与」和「了」放在一起很别扭。 | 「2026 Q1：超级投资者拿着什么、买了什么、卖了什么」（Q2 标题同步改） |
| learn.ts:358 | P1 | Z4 | zh description「…以及为什么「重合」依然不是信号。」 | 正文用「共识」，这里用「重合」。 | 「…以及为什么人多不等于该买。」 |
| learn.ts:367（505 同） | P2 | Z1 | zh「想了解单份申报怎么读，《如何读懂 13F》讲了机制。」 | covers the mechanics 直译。 | 「单份 13F 怎么读，见《如何读懂 13F》。」 |
| learn.ts:368（507 同） | P1 | Z1 | zh「其中一些仓位此后必定已经变了，而且没有一个数字告诉你任何人当初买在什么价位。」 | none of the figures tell you what anyone paid 的直译，否定词叠在一起。 | 「这些仓位之后多半已经动过；而且这里没有一个数字能告诉你，谁当初是在什么价位买的。」 |
| learn.ts:374 | P1 | Z4/X1 | zh「Alphabet 是被持有得最广的单一标的：16 家追踪组合通过它的 C 类股（GOOG）持有」 | widely held、through its C-share line 两处直译。 | 「持有人数最多的是谷歌母公司 Alphabet：16 个组合持有它的 C 类股（GOOG），另有 15 个持有 A 类股（GOOGL）。」 |
| learn.ts:381 | P2 | Z4 | zh「Microsoft 是本季被买得最广的名字」 | 「名字」「最广」两个口癖都在。 | 「本季买微软的基金最多。」 |
| learn.ts:382 | P2 | X2 | zh「医疗保险吸引了真金白银」 | managed care 是"管理式医疗"，不等于医疗保险。 | 「管理式医疗股也吸引了真金白银」 |
| learn.ts:388 | P2 | Z4 | zh「卖出一侧，领头的还是那几个家喻户晓的名字。」 | 「卖出一侧」容易和 sell-side（卖方）混淆；「名字」口癖。 | 「卖得多的，还是那几家巨头。」 |
| learn.ts:389 | P1 | Z4 | zh「UnitedHealth 值得放慢看一眼。」 | 「放慢」和「看一眼」放在一起意思打架；英文这句是北极星句，中文却没译出那个味道。 | 「联合健康值得多看两眼。」 |
| learn.ts:395 | P2 | Z4 | zh「既有能干的基金在买，也有能干的基金在卖」 | capable funds 直译。 | 「高手在买，也有高手在卖」 |
| learn.ts:396 | P1 | Z1 | zh「这就是共识凑近了看的样子。一群认真的投资者，研究同一家公司、看的是同样三个月，却走出了相反的结论。」 | what X looks like up close 直译；「走出了…结论」不是中文搭配。 | **改写示范：**「所谓共识，凑近了看就是这样：一群认真的投资人，同一个季度研究同一家公司，得出的结论正好相反。持有人数高，只说明这只股票在很多人的关注名单上；他们看法一致吗？通常不一致。」 |
| learn.ts:402 | P2 | X1 | zh「对一位经理为什么买…」 | 「经理」在别处叫投资者、管理人、投资人。 | 「…对投资人为什么买、买在什么价位，一个字也没有。」 |

### 3g. q2-2026-superinvestor-consensus

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:443 / 513 | P1 | X2（意思有误） | en "Together those five lines appear in 186 portfolios." / zh「这五行加起来出现在 186 个组合里。」 | 一共只有 92 个组合；186 是 41+40+37+35+33 五个持有人数的加总，说成"186 个组合"不对。 | en "Those five lines add up to 186 holdings across just 92 portfolios, about two per fund." / zh「五行加起来是 186 个持仓，摊到 92 个组合里，平均每家拿着两只。」 |
| learn.ts:428 / 498 | P1 | Z2/E3 | en "Two filings were read correctly only after a later fix (Ackman's 13F-NT notice and Olstein's zero-holdings report)" / zh「之后修复了两位投资人的申报读取（Ackman 的 13F-NT 代报、Olstein 的零持仓申报）」 | 顶部提示把工程修复过程和 13F-NT 这种表格代号直接给读者看。 | en "When this was written we counted 92 investors. We've since corrected how two filings were read (Bill Ackman's and Robert Olstein's), so the live pages now count 94." / zh「写作时计入 92 位。之后我们补上了当时漏算的 Ackman 和 Olstein 两位，实时页现在是 94 位。」 |
| learn.ts:430 | P2 | E4 | en "As of 2026-06-30, Compounder tracks 97 investors." | 英文正文里出现 ISO 日期，同段其他地方写 June 30 / August 14。 | "As of June 30, 2026, Compounder tracked 97 investors." |
| learn.ts:495 | P0 | Z4 | zh description「…本季买得最广和卖得最广的是谁…」 | 「买得最广」口癖进了 SEO 描述。 | 「解读 2026 Q2 的 13F：Compounder 追踪的 97 位投资人最常持有哪些股票，本季买的人最多、卖的人最多的是哪几只，以及为什么大部分卖出只是减仓。」 |
| learn.ts:513–514、528 | P1 | X1/X4 | 同一篇里「[[stock:BRK.B\|Berkshire Hathaway]]（26）」和「[[investor:…\|伯克希尔]]一家」并存；「台积电」用中文，Microsoft、Apple 用英文 | 公司名一半中文一半英文。 | 按术语清单统一成中文名。 |
| learn.ts:528、536 | P1 | X3 | zh「26 位投资人卖了一部分…C 类股有 19 家卖出…22 家卖出、4 家清仓」 | 同一段里「位」和「家」交替出现。 | 一律用「位」：「C 类股有 19 位卖出，无人清仓。接下来是微软，22 位卖出、4 位清仓…」 |
| learn.ts:529 | P2 | Z1 | zh「这些人是在给仍然持有的公司调仓位大小。」 | resizing positions 直译。 | 「他们并没走，只是把仓位调小了。」 |
| learn.ts:530、536 | P2 | Z4 | zh「大名字里一边倒的是 Apple」「大名字里最一边倒的是 Alphabet」 | big names 直译。 | 「巨头里卖压最一边倒的是苹果」 |
| learn.ts:544 | P2 | Z4 | zh「…这几张实时榜单会随申报陆续滚到新一季。」 | roll forward 直译成「滚到」。 | 「…这几张实时榜单会随新申报陆续切换到 Q3。」 |
| learn.ts:475 / 545 | P2 | E3/Z2 | en "Holder counts leave out positions those tables tag with an older quarter." / zh「持有家数不含这些表里标注为更早季度的仓位。」 | 内部口径；读者不知道"标注为更早季度"是什么意思。 | en "Holder counts include only Q2 positions; investors whose latest filing is older are left out." / zh「持有人数只算 Q2 的持仓，最新申报停在更早季度的投资人不计入。」 |

### 3h. reading-business-quality（ZH 评级 C）

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:636 | P1（首屏） | Z1/Z4 | zh intro「…这件事，你能从公司财报里的几个数字走出很远，而站上每个个股页都带着这些数字。…它不是对任何一只股票的定论，而是一种看法的方法。」 | get a long way toward 直译成「走出很远」，a way to look 直译成「一种看法的方法」，后者不合语法。 | **改写示范：**「在 Compounder 上，你能看到超级投资者拿着哪些股票、每季怎么增减。但知道谁在持有只是开头，更难也更值钱的问题是：这门生意本身到底好不好。回答它，财报里的几个数字就能帮你走完大半程，每个个股页上都有。这篇拿超级投资者最常持有的几家公司做例子，讲怎么读这些数字。不评判哪只该买，只讲怎么看。」 |
| learn.ts:642 | P1 | Z1/Z5 | zh「没有哪一个数字叫'质量'。…所以你能对站上任何一个持仓跑一遍这套读法。」 | 用了直引号；「跑一遍这套读法」直译 run this read。 | 「没有哪个单一指标能叫「质量」。…站上任何一只股票，你都可以照这个思路过一遍。」 |
| learn.ts:646 | P1 | Z4 | zh 小标题「利润率：对定价权的第一眼」 | 「对…的第一眼」不是中文。 | 「利润率：定价权的第一道检验」 |
| learn.ts:648 | P1 | Z1/Z4 | zh「净利率，是每一块钱营收里最终活到利润那一步的比例。它是对定价权最快的一眼。」 | survives all the way down、quickest read on 两处直译。 | **改写示范：**「净利率，就是每卖 100 块钱，最后能落下几块钱净利润。看定价权，这是最快的指标：成本之上还能稳稳多收一大截的生意，净利率又高又稳；靠拼价格活着的，做不到。」 |
| learn.ts:649 | P1 | X2/Z4 | zh「一家支付网络或评级特许经营，只是从一笔它不必出资的庞大流水里抽一小道。…这是卖实物、跑仓库而非守收费站的本性。」 | ratings franchise 是"评级牌照生意"，不是"特许经营"（加盟）；「抽一小道」「本性」也是生造搭配。 | 「支付网络和评级机构，都是从一股自己不用垫钱的巨大资金流里抽一点点成。…卖实物、开仓库的生意，本来就赚不到收费站的利润率。」 |
| learn.ts:650 | P2 | Z1 | zh「因为超市和软件公司活在两个世界」 | live in different worlds 直译。 | 「超市和软件公司根本不是一门生意，没法放在一起比」 |
| learn.ts:656 | P1 | Z1/Z7 | zh「账面利润和现金不是一回事，而两者之间的缺口，能告诉你关于一门生意的很多事。自由现金流，是公司付完维持运营、再投资运营的钱之后剩下的现金。FCF 利润率…巴菲特的'股东盈余'（owner earnings）是同一个直觉」 | tells you a lot about、the same instinct 直译；定义句堆了两层动宾；混入缩写 FCF。 | 「账面利润不等于现金，两者差多少，很能说明一门生意的底色。自由现金流，是公司付完日常开销和维持、扩张所需的投入后，手里真正剩下的钱；它占营收的比例叫自由现金流率。巴菲特说的「股东盈余」（owner earnings）是一个意思：年底股东真正能拿走多少。」 |
| learn.ts:657 | P2 | Z4 | zh「Mastercard 是同一个形状…这些都是轻资本的机器。」 | the same shape、machines 直译。 | 「万事达也是这样…两家都是典型的轻资产生意。」 |
| learn.ts:664 | P1 | Z1 | zh「…这也是为什么这个指标处在质量投资的中心附近。」 | sits near the center of 直译。 | 「…所以讲究质量的投资人，最看重的往往就是这个指标。」 |
| learn.ts:662 / 596 | P2 | X1 | zh 小标题「资本回报率，以及它为什么骗人」/ en "Return on capital, and why it misleads"，正文讲的却是 ROE | 小标题和正文说的不是同一个指标。 | zh「净资产收益率（ROE），以及它为什么会骗人」/ en "Return on equity, and why it misleads" |
| learn.ts:665 | P2 | Z1 | zh「…远不如同样的数字坐在稳如堡垒的资产负债表上值钱。」 | sitting on 直译。 | 「…远不如资产负债表扎实的公司做出同样的数字来得可靠。」 |
| learn.ts:672 | P1 | Z1/Z4 | zh「一个有利润却没有现金垫底的高利润率、一个坐在一堆债务上的高资本回报、一个这季看着还行却已连跌三年的数字：…把缺口当成一个问题，而不是一次放行。」 | 连用三个「一个」；「一次放行」不是中文搭配。 | 「利润率很高却没有现金进账，ROE 很高却是靠借债撑起来的，这季看着还行其实已连跌三年：这些毛病只有把几个数字摆在一起才看得出来。…数据缺了，就当成一个待查的问题，别当它没事。」 |
| learn.ts:678–679 | P2 | Z1 | zh「它们对接下来会怎样只字不提：护城河会被侵蚀、一位新管理者会改变资本怎么花…」「…只属于你自己」 | 「只字不提」口癖；「一位新管理者」多余量词；is yours alone 直译。 | 「它们看不出以后：护城河会被侵蚀，换个管理层钱就可能换个花法，整个行业也可能转向。」 |
| learn.ts:605 / 671 | P2 | X2 | en "Alphabet's free cash flow running at a little more than half its net margin" / zh「Alphabet 的自由现金流只有净利率的一半出头」 | 拿现金流的绝对数和一个比率比，口径对不上；应该是自由现金流率和净利率比（18.2% 对 32.8%）。 | en "Alphabet's FCF margin running at just over half its net margin" / zh「Alphabet 的自由现金流率只有净利率的一半出头」 |
| learn.ts:565 | P2 | E4/E5 | en 标题 "What Makes a Business High Quality: Reading the Numbers Behind Superinvestor Holdings" | 太长，冒号后面是 SEO 腔。 | "What Makes a Business Good? Reading the Numbers Behind Superinvestor Holdings"，或者只留前半句。 |

### 3i. what-is-intrinsic-value（门面文，「从这里开始」）

| 位置 | 严重度 | 标签 | 现状 | 问题 | 建议改写 |
|---|---|---|---|---|---|
| learn.ts:704 | P0（门面首屏） | E2/E5 | en intro "…But you can't get that number either, not exactly. And that's the whole point. Intrinsic value isn't something you calculate. It's a way of admitting… That idea, and everything it forces on you, is the rest of this piece." | 一串"揭秘式"短句（And that's the whole point.），结尾再加一句路标句，是典型的 AI 开头。 | **改写示范：**"Everyone wants investing to come down to a number. The stock price is one, but it only tells you what the crowd will pay today. Intrinsic value is the number you actually want, and you can't pin it down either. Graham, Buffett, Li Lu, and Duan Yongping all start from that admission, then build a few habits that let you invest well without a precise figure."（保留原内链 token） |
| learn.ts:773 | P0（门面首屏） | Z1/Z4 | zh intro「股价就是个数字，可它是错的那个：它只告诉你此刻人群愿意出多少。内在价值看着像那个更好的、藏在价格底下的「真」数字。…下面讲的就是这件事，和它逼你养成的那些习惯。」 | 「人群」是 the crowd 的直译；「那个更好的、藏在…的「真」数字」是长定语；结尾也是路标句。 | 「谁都希望投资能归结成一个数。股价是一个数，可它只告诉你此刻市场肯出多少钱。你真正想要的是内在价值，可这个数同样算不准。格雷厄姆、巴菲特、李录、段永平都是从承认这一点出发的，再靠几条规矩，没有精确数字也能投得好。」 |
| learn.ts:724 / 793 | P1 | X2/E5 | en "In that 1999 Sun Valley talk, Buffett…" / zh「就在 1999 年太阳谷那场演讲里」 | "that" 和「那场」指代悬空，前文从没提过这场演讲。 | en "In a 1999 talk at Sun Valley, later printed in Fortune, Buffett stripped investing down to a sentence…" / zh「1999 年在太阳谷的一次演讲里（后刊于《财富》杂志），巴菲特把投资剥到只剩一句话：…」 |
| learn.ts:732 / 801 | P1 | X2/E5 | en "The four-concept version of value investing has a fourth leg that Graham didn't lean on…" / zh「把价值投资讲成四个基本概念，第四条是…」 | 前三个概念从来没点过名，读者看到「第四条」会摸不着头脑。 | en "Graham gave value investing three of its core ideas: a share is a piece of a business, Mr. Market, and the margin of safety. Buffett added a fourth from fifty years of practice: the circle of competence." / zh「格雷厄姆留下了三个基本概念：股票是生意的一部分、市场先生、安全边际。巴菲特干了五十年，补上了第四个：能力圈。」 |
| learn.ts:803 vs 734 | P2 | X2 | zh 多了一句「这不是价值低，是没有价值可谈。」，en 没有 | 中英语义不对等（这句中文写得不错，可以反向补进英文）。 | en 补："It isn't that the value is low. There's no value you can talk about at all." |
| learn.ts:810 | P2 | Z4 | zh「十年后还依然强壮？」 | still be strong 直译成「强壮」。 | 「十年后还能不能打？」 |
| learn.ts:816 | P1 | Z1 | zh「你手里有一门确实看得懂的生意的一个区间，你也知道它可能错。」 | 一长串「的」，句子读不通。 | **改写示范：**「假设你已经看懂一门生意，也给它估出了一个价值区间，同时清楚这个区间可能估错。正因为可能错，才有那条省不得的规矩：格雷厄姆的安全边际。」 |
| learn.ts:823 | P1 | Z1/X1 | zh「这就是你在这里个股页上看到的东西背后的框架。价值估算显示成一条带，…作为折现的锚，因为那是一切用来衡量的机会成本。」 | 「这里个股页上」语序直译；「一条带」没有解释；最后一句的结构照搬英文。 | 「个股页上的估值就是照这个思路做的。价值估算给的是一个区间，不是一个目标价，因为诚实的估计本来就是区间。…十年期美债收益率是折现的基准：它就是你这笔钱的机会成本。」 |
| learn.ts:726 / 795 | P2 | E5 | en "It's the gravity the rest of your money gets weighed against." / zh「它就是你其余的钱用来称重的那股地心引力。」 | 引力和称重两个比喻混在一起，两侧都不通。 | en "Every other use of your money has to beat it." / zh「你的钱放在别处，起码得跑赢它。」 |
| learn.ts:716–740 | P2 | E5 | en "Duan puts it plainer still" / "Duan is blunt" / "Duan is blunter still" | 引语前的引导词重复。 | 后两处直接引用，不加引导，或改成 "Duan's test is simpler:"。 |

### 3j. 季度报告模板（reports/copy.ts、ReportArticle.tsx）

| 位置 | 严重度 | 标签 | 现状（拼接后的渲染句） | 问题 | 建议改写 |
|---|---|---|---|---|---|
| reports/copy.ts:15 | P0 | X1/Z4 | zh 标题「Q3 2026 超级投资者共识报告」 | 季度用英文语序，和文章的「2026 Q1」不一致；这是标题、SEO 和 OG 卡片。 | 「2026 Q3 超级投资者共识报告」（quarterLabel 按 lang 输出） |
| reports/copy.ts:43–48 | P0 | Z1/Z2/Z4 | zh description（申报中）：「Q3 2026，截至目前（97 位中 60 位已申报）：12 位超级投资者新建或加仓 GOOG；持有人数最多的是 MSFT（41 位，较上季 +2）；被至少 2 位持有的股票中，有 5 只处在击球区或低于内在价值。」 | 这一句同时用作 meta、OG、索引「最新」卡片和报告导语。逗号、括号、冒号叠在一起；「新建或加仓 GOOG」缺宾语；被字句；击球区本来就属于低于内在价值，并列显得重复；只给 ticker，不给公司名。 | **改写示范：**「2026 Q3 申报进行中，97 位里已有 60 位交卷。目前新买或加仓 Alphabet（GOOG）的人最多，共 12 位；持有人数最多的仍是微软，41 位，比上季多 2 位；至少两位共同持有的股票里，有 5 只现价低于内在价值。」 |
| reports/copy.ts:50–55 | P0 | E1/E5 | en description: "Q3 2026, so far (60 of 97 filed): 12 superinvestors opened or added to GOOG; the most widely held stock is MSFT (41 holders, +2 vs. last quarter); 5 stocks held by two or more sit in the strike zone or below intrinsic value." | 用分号串起来的一长句；"held by two or more" 缺名词。 | "Q3 2026 filings so far, 60 of 97 in: 12 superinvestors bought or added to Alphabet (GOOG), more than any other stock. Microsoft is still the most widely held, with 41 holders (+2). Five stocks owned by at least two of them trade below our intrinsic-value estimate." |
| reports/copy.ts:46 / 53 | P2 | Z2/E5 | 空状态：「已申报的投资人中暂无满足条件的共识动作」/ "no consensus moves qualify among the funds that have filed" | 「满足条件的共识动作」是工程说法。 | 「已申报的投资人里，还没有两位以上买卖同一只股票」/ "no stock has been bought or sold by two or more of the funds that have filed" |
| freshness/excludedClause.ts（经 copy.ts:68、191–193 调用） | P1 | X3/E1 | en "94 of the 97 superinvestors this site tracks that filed for the prior quarter or later (3 more missed last quarter and aren't counted)"；状态条 "60 of 97 have filed (3 more missed last quarter…)" | 方法说明里，97 已经包含这 3 位，"3 more" 把它们说成了额外的 3 位，事实不对；"missed last quarter" 也没说漏了什么。 | 方法说明 en："Data comes from 13F filings on SEC EDGAR. We track 97 superinvestors; 3 didn't file last quarter, so this report counts the other 94." zh：「数据来自 SEC EDGAR 上的 13F 申报。本站追踪 97 位超级投资者，其中 3 位上季未申报，本报告只算其余 94 位。」从句 en 改成 "(3 others didn't file last quarter and aren't counted)" |
| reports/copy.ts:191 | P1 | Z5/X3 | zh「覆盖本站追踪的 97 位中、上一季及之后有申报的 94 位超级投资者（另有 3 位上季未申报，不计入）」 | 顿号当逗号用；「97 位中」和括号里的「另有 3 位」把同一件事说了两遍。 | 见上一条 zh 改写 |
| reports/copy.ts:85–86 | P1 | Z2/E3 | zh「价值位置按 2026-11-14 收盘价计算（晚于该季申报季）。」/ en "Valuation positions use closing prices as of 2026-11-14 (later than that quarter's filing season)." | 「价值位置」是自造词，英文 position 还会被读成"持仓"；「晚于该季申报季」不通顺。这句同时显示在小节右上角的来源标签里。 | zh「按 2026-11-14 收盘价计算（已过该季申报截止日）。」/ en "Prices as of the Nov 14, 2026 close (after this quarter's filing deadline)." |
| reports/copy.ts:80 vs 85 | P2 | X1 | 空值时说「估值位置暂不可用」，有值时说「价值位置按…」 | 同一个函数里两种叫法。 | 「估值暂不可用。」/ "Valuation isn't available yet." |
| reports/copy.ts:115–127、ReportArticle.tsx:107 | P1 | E1/Z2 | en "Warren Buffett: Shares down AAPL (portfolio weight 28% → 22%)" / zh「巴菲特：减少股数 AAPL（占组合 28% → 22%）」 | 英文语法不通；中文「减少股数 AAPL」是动词加名词硬拼。 | 标签改成 en "Bought more / Sold some / New position / Sold out"，zh「增持 / 减持 / 新建仓 / 清仓」（增减持本来就按股数算，和代码口径一致）。渲染后：en "Warren Buffett: Sold some AAPL (28% → 22% of portfolio)"；zh「巴菲特：减持 AAPL（占组合 28% → 22%）」 |
| reports/copy.ts:105 | P2 | E4 | kindLabel en "New position / Added / Trimmed / Sold out" | 名词和动词过去式混在一列。 | "New / Added / Trimmed / Sold out" |
| reports/copy.ts:146 | P1 | Z1/Z2/Z7 | zh 小节标题「被共同持有、处在击球区或低于内在价值」「方法与口径」「名家动作」 | 被字句加上过长的标题；简报点名「口径」不该给用户看；「动作」是内部词。 | 「多人持有、现价低于内在价值」「计算方法」「名家操作」 |
| reports/copy.ts:147 | P1 | E3/X2/X1 | en "Co-held stocks in the strike zone or below intrinsic value" / "Notable investors" / "Consensus buys" | Co-held 是自造词；"Notable investors" 对应的中文是「名家动作」，两侧意思不对等；"Consensus buys" 和站内榜单名 "Top buys" 不一致。 | "Held by two or more, priced below value" / "What notable investors did" / "Top buys" / "Top sells" |
| ReportArticle.tsx:45 | P1 | X2/E3 | 表头 zh「人数 / 主要动作」，en "Funds / Main move" | 中文说「人数」、英文说 Funds，两侧不对等；"Main move" 生硬。 | zh「人数 / 主要操作」，en "Investors / Most common move" |
| ReportArticle.tsx:54 | P1 | E3/Z2 | 表头 zh「位置」，en "Position" | 在持仓报告里，英文 Position 会被读成"仓位"；中文「位置」没说清是什么位置。 | zh「相对价值」，en "Price vs. value" |
| ReportArticle.tsx:67 | P2 | E1 | en "Counts below cover only funds that have filed and are not final." | "are not final" 的主语看起来是 funds。 | "Filing season is still open: counts below include only funds that have filed so far and will change." / zh「申报季还没结束：下表只算已申报的投资人，数字还会变。」 |
| ReportArticle.tsx:119、125 | P1 | Z7/E5 | zh「共识买入 / 卖出：统计本季相对上一季新建仓或加仓 / 减仓或清仓的投资人数…」en "count the funds that opened or added to / trimmed or sold out of a position…" | 两组斜杠交叉对应，读者得自己配对。 | zh「最多人买：本季新建仓或加仓的投资人数；最多人卖：本季减仓或清仓的投资人数。期权不计；没有上一季申报可比的投资人不计入。」en "Top buys counts funds that opened or added to a position this quarter; top sells counts funds that trimmed or sold out. Options are excluded, as are funds with no prior filing to compare." |
| ReportArticle.tsx:120、126 | P2 | Z2 | zh「…避免申报季中有人尚未申报造成虚降。」 | 「虚降」是工程词；引号用的是 “”，站内其他地方用「」。 | 「较上季：只比较本季和上季都已申报的投资人，免得有人还没交申报就把人数拉低。」 |
| ReportArticle.tsx:121、127 | P1 | Z2/Z3 | zh「击球区与价值带：来自本站估值引擎的保守价值区间，只取数据可靠的结果。」en "…come from this site's conservative valuation range, using reliable results only." | 「估值引擎」是工程腔；「只取数据可靠的结果」没说清标准。 | zh「击球区：现价比我们估的保守价值区间还低出一截安全边际。只用数据完整、估值可靠的股票。」en "Strike zone means the price sits below our conservative value range by at least a margin of safety. Only stocks with complete data and a reliable estimate are included." |
| ReportArticle.tsx:122、128 | P2 | Z2/E5 | zh「申报季结束、覆盖率达标后，本报告会定稿冻结。」en "…will be finalized and frozen." | 「覆盖率达标」是工程词；「定稿冻结」说了两遍。 | zh「申报季结束、大部分投资人交齐后，本报告定稿，之后不再变动。」en "Once the filing season closes and most funds have filed, this report becomes final and stops changing." |
| ReportArticle.tsx:131、134 | P2 | X1 | 「什么是内在价值 →」「实时共识页 →」 | 链接文字和文章标题、页面名都对不上。 | 「一只股票到底值多少钱 →」「共识持仓 →」/ "What is a stock actually worth? →" "Consensus holdings →" |
| reports/copy.ts:165 | P2 | Z2 | zh「本季无可比动作（缺上一季申报）」 | 「可比动作」是工程词。 | 「上一季没有申报，无从比较」/ "No prior filing to compare against" |

---

## 4. 本区域最想优先改的 Top 5

1. **重写 `reading-business-quality` 中文版（C 级）。** 不要逐句对译，按中文的论证顺序重写一遍。可以用上面 636、648、656、672 四段改写作为声音样本；标题、描述、小标题一并改。
2. **报告模板首屏那一句（`reportDescription`）和报告标题。** 这句同时出现在 meta、OG、Learn「最新」卡片和报告导语，曝光最高。拆成短句，写公司名，去掉「击球区或」的重复，季度标签按语言分开输出；同时修掉 "Shares down AAPL" 和 "3 more missed last quarter" 这两处英文错误。
3. **中文全站统一标点、公司名、人称量词。** 这是一次机械改动，收益很大：文章正文半角改全角，公司名统一成中文，称人统一「投资人」加「位」，季度统一「2026 Qn」，引号统一「」。可以在 `ai-check` 里加规则，防止以后再出现。
4. **清掉中文的英文口癖。** 「名字」×14、「被…得最广」×6、「只字不提」×5、「一个/一位」多余量词、后置定语。重点改 `reading-cross-fund-consensus`（266、272、273、283）和 Q1（374、389、396）。
5. **修两处事实性或指代错误，再改门面文开头。** Q2 的 "186 portfolios"（两侧都错），intrinsic-value 的 "that 1999 Sun Valley talk" 和 "four-concept version" 两处悬空指代，cross-fund 第 216 行不通的英文；门面文中英 intro 去掉路标句和揭秘式短句。7 篇的模板化结尾，顺手交给页面组件统一处理。
