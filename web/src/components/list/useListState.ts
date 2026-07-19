"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  LIST_Q_DEBOUNCE_MS,
  LIST_Q_MAX,
  nextSortState,
  parseListParams,
  serializeListParams,
  type ListParams,
  type ParseOpts,
  type VerdictFilter,
} from "./listQuery";

export function useListState(opts: ParseOpts) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = useMemo(
    () => parseListParams(new URLSearchParams(searchParams.toString()), opts),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opts identity is stable per page
    [searchParams, opts.defaultSort, opts.hasVf, opts.allowedSorts.join("|")]
  );

  const [qInput, setQInput] = useState(parsed.q);
  useEffect(() => {
    setQInput(parsed.q);
  }, [parsed.q]);

  const replace = useCallback(
    (next: ListParams) => {
      const qs = serializeListParams(next, {
        defaultSort: opts.defaultSort,
        hasVf: opts.hasVf,
      });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, opts.defaultSort, opts.hasVf]
  );

  const parsedRef = useRef(parsed);
  parsedRef.current = parsed;
  const replaceRef = useRef(replace);
  replaceRef.current = replace;

  // Debounced q → URL; resets page. Refs avoid stale parsed/replace in narrow-deps effect.
  useEffect(() => {
    const t = setTimeout(() => {
      const q = qInput.slice(0, LIST_Q_MAX);
      const current = parsedRef.current;
      if (q === current.q) return;
      replaceRef.current({ ...current, q, page: 1 });
    }, LIST_Q_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [qInput]);

  const setSortKey = (clicked: string) => {
    const { sort, dir } = nextSortState(parsed.sort, parsed.dir, clicked);
    replace({ ...parsed, sort, dir, page: 1 });
  };

  const setVf = (vf: VerdictFilter) => {
    replace({ ...parsed, vf, page: 1 });
  };

  /** Caller clamps with pageCount(filtered.length) before/inside setPage. */
  const setPage = (page: number) => {
    replace({ ...parsed, page: Math.max(1, page) });
  };

  const commitQNow = () => {
    const q = qInput.slice(0, LIST_Q_MAX);
    replace({ ...parsed, q, page: 1 });
  };

  return {
    ...parsed,
    qInput,
    setQInput,
    commitQNow,
    setSortKey,
    setVf,
    setPage,
  };
}
