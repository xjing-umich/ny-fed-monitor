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

export async function fetchFredSeries(id: string): Promise<FredSeries> {
  const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}`;
  const csv = await fetch(url, {
    next: { revalidate: 3600, tags: [`fred-${id}`] },
  }).then((res) => {
    if (!res.ok) throw new Error(`${url} ${res.status}`);
    return res.text();
  });
  return parseFredCsv(id, csv);
}

export async function fetchFredSeriesBatch(ids: string[]): Promise<FredSeries[]> {
  return Promise.all(ids.map((id) => fetchFredSeries(id)));
}
