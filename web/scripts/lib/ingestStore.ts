/** 落库与派生发布之间的闸:抓取成功不等于落库成功。 */
export class ManagerWriteError extends Error {
  constructor(readonly written: number, readonly failures: string[]) {
    super(`Supabase 写入失败 ${failures.length} 位(成功 ${written}): ${failures.join('; ')}`);
  }
}

export async function storeBeforeDeriving<T extends { manager: { slug: string } }, R>(
  details: T[], write: (detail: T) => Promise<void>, derive: () => Promise<R>,
): Promise<{ written: number; result: R }> {
  let written = 0;
  const failures: string[] = [];
  for (const detail of details) {
    try { await write(detail); written++; }
    catch (error) { failures.push(`${detail.manager.slug}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  // 已写入的来源保留供重跑;任何落库失败都阻止后续派生发布/报告/站点刷新。
  if (failures.length) throw new ManagerWriteError(written, failures);
  return { written, result: await derive() };
}

export function needsSiteRefresh(newAccessions: string[] | null, derivedChanged: boolean): boolean {
  return newAccessions === null || newAccessions.length > 0 || derivedChanged;
}
