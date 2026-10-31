import type { ReactNode } from 'react';
import type { PublishedValuation } from '@/lib/valuation/publishedRead';
import type { Lang } from '@/lib/nav';
import { publicationStamp } from '@/lib/valuation/publicationProjection';
import { ValuationSafetyBoundary } from './ValuationSafetyBoundary';
export function PublishedValuationBoundary({records,lang,children}:{records:PublishedValuation[];lang:Lang;children:ReactNode}){
 return <ValuationSafetyBoundary records={records.map(publicationStamp)} lang={lang}>{children}</ValuationSafetyBoundary>;
}
