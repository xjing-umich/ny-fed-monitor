// netNet.ts — Graham 净流动资产价值(NCAV)。清算式资产底:只认流动资产减全部负债。
// 价格无关的纯基本面量;触发判定(现价 < 每股)在 verdict 层结合现价完成。
// 缺字段/负 NCAV/股数非正 → 不可评估(诚实降级,金融/外国股天然无 current_assets)。

export type NetNetLamp =
  | { assessable: true; per_share: number; ncav: number }
  | { assessable: false; reason: string };

// 折让上限:折让>80%(现价 < 每股 NCAV × 0.2)落在数据存疑区
// (与引擎 isImplausibleBand 的 SANE_MARGIN_MAX 同阈值),抑制以免展示"好到不真实"的净net。
export const NETNET_MAX_DISCOUNT = 0.8;

/** net-net 触发判定:现价 < 每股 NCAV 且折让不超过 NETNET_MAX_DISCOUNT。唯一权威实现,card/verdict 共用。 */
export function isNetNetTriggered(lamp: NetNetLamp, price: number | null | undefined): boolean {
  return (
    lamp.assessable &&
    Number.isFinite(lamp.per_share) &&
    lamp.per_share > 0 &&
    price != null &&
    price > 0 &&
    price < lamp.per_share &&
    price >= lamp.per_share * (1 - NETNET_MAX_DISCOUNT)
  );
}

export function computeNetNet(input: {
  currentAssets?: number;
  totalLiabilities?: number;
  sharesDiluted?: number;
}): NetNetLamp {
  const { currentAssets, totalLiabilities, sharesDiluted } = input;
  if (currentAssets == null || totalLiabilities == null || sharesDiluted == null)
    return { assessable: false, reason: "缺少流动资产/总负债/摊薄股数,无法计算净流动资产。" };
  if (!(sharesDiluted > 0))
    return { assessable: false, reason: "摊薄股数非正,无法计算每股净流动资产。" };
  const ncav = currentAssets - totalLiabilities;
  const per_share = ncav / sharesDiluted;
  if (!(per_share > 0)) return { assessable: false, reason: "净流动资产为负,非 net-net。" };
  return { assessable: true, per_share, ncav };
}
