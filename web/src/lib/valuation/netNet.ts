// netNet.ts — Graham 净流动资产价值(NCAV)。清算式资产底:只认流动资产减全部负债。
// 价格无关的纯基本面量;触发判定(现价 < 每股)在 verdict 层结合现价完成。
// 缺字段/负 NCAV/股数非正 → 不可评估(诚实降级,金融/外国股天然无 current_assets)。

export type NetNetLamp =
  | { assessable: true; per_share: number; ncav: number }
  | { assessable: false; reason: string };

// 折让上限:折让>80%(现价 < 每股 NCAV × 0.2)落在数据存疑区,抑制"好到不真实"的净net。
export const NETNET_MAX_DISCOUNT = 0.8;
// Graham 经典买入线:现价 ≤ ⅔ 每股 NCAV(《The Intelligent Investor》"two-thirds working-capital";Oppenheimer 1986 学术标准)。
export const GRAHAM_NCAV_BUY_FRACTION = 2 / 3;

function withinSaneBand(lamp: NetNetLamp, price: number | null | undefined): lamp is NetNetLamp & { assessable: true } {
  return (
    lamp.assessable &&
    Number.isFinite(lamp.per_share) &&
    lamp.per_share > 0 &&
    price != null &&
    price > 0 &&
    price >= lamp.per_share * (1 - NETNET_MAX_DISCOUNT) // 折让不超 80%（数据存疑闸）
  );
}

/** 资产底信号:现价 < 每股 NCAV 且折让≤80%。识别"这是一只 net-net"，非买入线。 */
export function isNetNetAssetFloor(lamp: NetNetLamp, price: number | null | undefined): boolean {
  return withinSaneBand(lamp, price) && price! < lamp.per_share;
}

/** Graham 买入线:现价 ≤ ⅔ 每股 NCAV 且折让≤80%。安全边际达标的"便宜可买"判定。 */
export function isNetNetBuy(lamp: NetNetLamp, price: number | null | undefined): boolean {
  return withinSaneBand(lamp, price) && price! <= lamp.per_share * GRAHAM_NCAV_BUY_FRACTION;
}

export function computeNetNet(input: {
  currentAssets?: number;
  totalLiabilities?: number;
  sharesDiluted?: number;
  preferredStock?: number;
}): NetNetLamp {
  const { currentAssets, totalLiabilities, sharesDiluted, preferredStock } = input;
  if (currentAssets == null || totalLiabilities == null || sharesDiluted == null)
    return { assessable: false, reason: "缺少流动资产/总负债/摊薄股数,无法计算净流动资产。" };
  if (!(sharesDiluted > 0))
    return { assessable: false, reason: "摊薄股数非正,无法计算每股净流动资产。" };
  // Graham 精确口径:优先股有优先求偿权,普通股 NCAV 须先扣优先股账面(缺失则 ?? 0 恒等降级)。
  const ncav = currentAssets - totalLiabilities - (preferredStock ?? 0);
  const per_share = ncav / sharesDiluted;
  if (!(per_share > 0)) return { assessable: false, reason: "净流动资产为负,非 net-net。" };
  return { assessable: true, per_share, ncav };
}
