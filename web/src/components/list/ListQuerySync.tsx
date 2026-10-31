'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function QueryReader({ onChange }: { onChange: (query: string) => void }) {
  const params = useSearchParams();
  const query = params.toString();
  useEffect(() => { onChange(query); }, [query, onChange]);
  return null;
}

/** Only URL observation suspends; default list rows remain in static HTML. */
export function ListQuerySync({ onChange }: { onChange: (query: string) => void }) {
  return <Suspense fallback={null}><QueryReader onChange={onChange} /></Suspense>;
}
