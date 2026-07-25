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
  const { defaultSort, hasVf } = opts;
  // 用字符串 dep 稳定 allowedSorts 数组 identity(调用方每次渲染都新建数组)。
  const allowedKey = opts.allowedSorts.join("|");

  const parsed = useMemo(
    () =>
      parseListParams(new URLSearchParams(searchParams.toString()), {
        defaultSort,
        hasVf,
        allowedSorts: allowedKey.split("|"),
      }),
    [searchParams, defaultSort, hasVf, allowedKey]
  );

  // URL 里的 q 变化(后退/前进、外链带参)时同步进输入框 ——
  // React 认可的「渲染期间派生 state」写法,替代 effect setState。
  const [qInput, setQInput] = useState(parsed.q);
  const [prevParsedQ, setPrevParsedQ] = useState(parsed.q);
  if (parsed.q !== prevParsedQ) {
    setPrevParsedQ(parsed.q);
    setQInput(parsed.q);
  }

  const replace = useCallback(
    (next: ListParams) => {
      const qs = serializeListParams(next, { defaultSort, hasVf });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, defaultSort, hasVf]
  );

  // 最新 parsed/replace 给防抖 effect 用 —— ref 只在 effect 里写(渲染期不写)。
  const parsedRef = useRef(parsed);
  const replaceRef = useRef(replace);
  useEffect(() => {
    parsedRef.current = parsed;
    replaceRef.current = replace;
  });

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
