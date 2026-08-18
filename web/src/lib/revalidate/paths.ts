/**
 * 数据驱动页面的完整清单 —— 任何 ingest 落库后都应整体刷新的那批页。
 *
 * 路径按**路由文件结构**写,不是用户可见 URL:英文走裸 URL 经 proxy rewrite 到 /en/…,
 * 中文为 /zh/…,两者都由 app/[lang]/… 渲染。用 `/[lang]/…` 模式一次覆盖双语,同时避开
 * "有 rewrite 时必须传目标路径" 的坑 —— Next 文档:revalidatePath operates on the
 * route file structure, not the URL visible to users。
 *
 * 为什么不按 13F / 估值分组刷新:9 个数据页里 7 个同时读两类数据(如 /stocks 既读
 * mostHeld 又读 valuationSnapshot,/investors/consensus 既读 holderDeltas 又读
 * readValuationVerdicts)。分组的收益是省下几次重新生成,代价是任一页漏配就会让页面之间
 * 互相矛盾(A 页新数、B 页旧数),而这种矛盾没有任何报错、只能靠肉眼发现。
 * 在路由处理器里调用 revalidatePath 只是**标记**陈旧,重新生成发生在下次访问,
 * 所以"全量标记"几乎零成本 —— 用这点成本换掉整类静默失配,值得。
 *
 * 不变量:本清单 ⟺ 全部带 `export const revalidate` 的 page.tsx。
 * 由 scripts/revalidate-paths.check.ts 双向校验(新增数据页忘了登记、或路由改名导致
 * 模式失配,都会在那里红灯 —— revalidatePath 对不存在的路径静默无操作,不会自己报错)。
 */
export const DATA_DRIVEN_PATHS = [
  "/[lang]",
  "/[lang]/investors",
  "/[lang]/investors/[slug]",
  "/[lang]/investors/buys",
  "/[lang]/investors/consensus",
  "/[lang]/investors/sells",
  "/[lang]/stocks",
  "/[lang]/stocks/[ticker]",
  "/[lang]/stocks/screener",
] as const;
