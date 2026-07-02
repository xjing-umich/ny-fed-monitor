// netNet.ts — Graham 净流动资产价值(NCAV)。清算式资产底:只认流动资产减全部负债。
// 价格无关的纯基本面量;触发判定(现价 < 每股)在 verdict 层结合现价完成。
// 缺字段/负 NCAV/股数非正 → 不可评估(诚实降级,金融/外国股天然无 current_assets)。

export type NetNetLamp =
  | { assessable: true; per_share: number; ncav: number }
  | { assessable: false; reason: string };

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
