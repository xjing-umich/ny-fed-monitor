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
 * 十分钟足够吃掉一波重建(通常几分钟内跑完)，又不会跨过 ingest 边界太久。
 *
 * 刻意不标 `server-only`:这是纯内存工具，不含任何服务端凭据或逻辑，标了会让
 * .check.ts 无法用 tsx 直接跑。服务端边界由使用它的 securities.ts 守住。
 *
 * 缓存的是 Promise 而非结果:并发调用共用同一次在途请求，否则冷启动时的
 * 并发重建会同时发起 N 次全表拉取。失败不入缓存，下次调用重试。
 */
type Entry<T> = { promise: Promise<T>; expiresAt: number };

const store = new Map<string, Entry<unknown>>();

export function processCached<T>(key: string, ttlMs: number, load: () => Promise<T>): () => Promise<T> {
  return () => {
    const now = Date.now();
    const hit = store.get(key) as Entry<T> | undefined;
    if (hit && hit.expiresAt > now) return hit.promise;

    const promise = load().catch((err) => {
      // 失败不留在缓存里,否则一次抖动会被固化 ttlMs 之久。
      store.delete(key);
      throw err;
    });
    store.set(key, { promise, expiresAt: now + ttlMs });
    return promise;
  };
}

/** 仅供测试:清空缓存。 */
export function __clearProcessCache() {
  store.clear();
}
