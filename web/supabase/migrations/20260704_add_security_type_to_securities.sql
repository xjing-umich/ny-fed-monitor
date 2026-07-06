-- 证券类型列(OpenFIGI securityType)。用于把非经营性载体(ETP/基金/权证等)挡在盈利法估值之外——
-- 如 SIVR/GLD 这类实物商品信托本无营收/持续盈利力,不该出现在 strike/低估清单里。
-- REIT / Common Stock(含银行)是经营性实体,不受影响(见 src/lib/securities/openfigi.ts NON_OPERATING_SECURITY_TYPES)。
-- 既有行 security_type=NULL → 视为可估(保守,不静默漏真公司),待 scripts/backfill-security-type.ts 回填。
-- 部署: 执行本文件 → npm run enrich:security-type 回填 → 从带过滤代码重跑 npm run valuation:ingest。
alter table securities
  add column if not exists security_type text;
