/**
 * 进程级 TTL 缓存 —— egress 护栏。
 *
 * React 的 `cache()` 只在**单次请求**内去重。全表 Map(getCusipMap /
 * getTickerExchangeMap)被每个个股页、每张 OG 图、每个投资人页各调一次，
 * 一波 ISR 重建下来同一张表要拉几百遍。Vercel 的 Fluid Compute 会复用函数实例，
 * 所以模块级缓存能让同一实例内的这些重建共用一次拉取。
 *
 * TTL 刻意取短(分钟级):这些表由 13F ingest(周一/四)更新，缓存太久会让 ingest 后
 * 立刻重建的页面拿到旧映射 —— 表现为新证券显示裸 CUSIP 而不是 ticker。
 *
 * 光靠 TTL 不够:ingest 写完表就立刻 revalidate,而 revalidate 之前十分钟内载入的缓存仍在
 * TTL 内,重建出来的页面照样是旧映射(2026-10-28 实测:GM 新映射写入后，Greenhaven 页
 * 仍显示裸 CUSIP,直到下一次 revalidate)。revalidate 路由只跑在一个实例上，清不到别的实例。
 * 所以可选传 `version`:一次很小的查询(行数 + 最新改动标记)，每次调用都比一次，
 * 变了就当场重拉。TTL 仍保留作上限;version 读失败或返回 null 时退回纯 TTL。
 *
 * 刻意不标 `server-only`:这是纯内存工具，不含任何服务端凭据或逻辑，标了会让
 * .check.ts 无法用 tsx 直接跑。服务端边界由使用它的 securities.ts 守住。
 *
 * 缓存的是 Promise 而非结果:并发调用共用同一次在途请求，否则冷启动时的
 * 并发重建会同时发起 N 次全表拉取。失败不入缓存，下次调用重试。
 */
type Entry<T> = { promise: Promise<T>; expiresAt: number; version: string | null };

const store = new Map<string, Entry<unknown>>();

export function processCached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
  version?: () => Promise<string | null>,
): () => Promise<T> {
  return async () => {
    const v = version ? await version().catch(() => null) : null;
    const now = Date.now();
    const hit = store.get(key) as Entry<T> | undefined;
    // v 为 null(没传 version 或读失败)→ 只看 TTL;否则还要版本一致。
    if (hit && hit.expiresAt > now && (v === null || hit.version === v)) return hit.promise;

    const promise = load().catch((err) => {
      // 失败不留在缓存里,否则一次抖动会被固化 ttlMs 之久。
      if (store.get(key)?.promise === promise) store.delete(key);
      throw err;
    });
    store.set(key, { promise, expiresAt: now + ttlMs, version: v });
    return promise;
  };
}

/** 仅供测试:清空缓存。 */
export function __clearProcessCache() {
  store.clear();
}
