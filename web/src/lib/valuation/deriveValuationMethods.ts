import type { OeDcfAssessment, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor } from "./types";

export type ValuationMethods = {
  zeroGrowthEpv: boolean;
  oeDcf: boolean;
  greenwaldGrowthCeilings: boolean;
};

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

export function deriveValuationMethods(args: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
}): ValuationMethods {
  const epv = args.strikeZone?.epv;
  const zeroGrowthEpv = !!epv;
  const oe = args.oeDcf;
  const oeDcf =
    !!oe?.assessable &&
    finitePositive(oe.per_share_low) &&
    finitePositive(oe.per_share_high);
  const greenwaldGrowthCeilings = !!epv?.ceilings;
  return { zeroGrowthEpv, oeDcf, greenwaldGrowthCeilings };
}
