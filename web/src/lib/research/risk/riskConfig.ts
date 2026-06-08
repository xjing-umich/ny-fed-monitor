export const RISK_SIGNAL_SOURCE = "SYSTEM_DERIVED_RISK_SIGNAL" as const;

export const RISK_THRESHOLDS = {
  marginCompressionBps: 100,
  peAbove: 40,
  pfcfAbove: 40,
  fcfYieldBelow: 0.025,
  earningsYieldBelow: 0.025,
  weakFcfConversionBelow: 0.6,
  weakInterestCoverageBelow: 3,
  marginVolatilityRangeBps: 500,
} as const;
