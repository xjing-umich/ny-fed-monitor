export type FredPoint = {
  date: string;
  value: number | null;
};

export type FredSeries = {
  id: string;
  points: FredPoint[];
};

function toFloat(value: string): number | null {
  const text = value.trim();
  if (!text || text === "." || text.toLowerCase() === "nan") return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseFredCsv(id: string, csv: string): FredSeries {
  const lines = csv.trim().split(/\r?\n/);
  const points: FredPoint[] = [];
  for (const line of lines.slice(1)) {
    const [date, value] = line.split(",");
    if (!date) continue;
    points.push({ date, value: toFloat(value ?? "") });
  }
  return { id, points };
}

// 硬超时:FRED 不可达/慢时(尤其构建机出网受限),无超时的 fetch 会一直挂到 Next 60s
// 页面预渲染上限 → 整个 next build 失败(部署事故根因)。AbortSignal.timeout 保证 fetch
// 必在 8s 内 resolve 或 reject;失败由各调用方降级(getLatestDgs10→null、buildAllSections→
// 该 section unavailable),绝不阻塞构建。
const FRED_TIMEOUT_MS = 8000;

export async function fetchFredSeries(id: string): Promise<FredSeries> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`;
  const csv = await fetch(url, {
    next: { revalidate: 3600, tags: [`fred-${id}`] },
    signal: AbortSignal.timeout(FRED_TIMEOUT_MS),
  }).then((res) => {
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.text();
  });
  return parseFredCsv(id, csv);
}

export async function fetchFredSeriesBatch(ids: string[]): Promise<FredSeries[]> {
  return Promise.all(ids.map((id) => fetchFredSeries(id)));
}
