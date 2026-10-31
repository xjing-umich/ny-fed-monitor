import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "./DataTable";

const columns = [{ key: "holders", header: "持有人数", sortKey: "holders", cell: (r: number) => r }];
for (const dir of ["asc", "desc"] as const) {
  const html = renderToStaticMarkup(<DataTable columns={columns} rows={[2]} getKey={String}
    sortKey="holders" sortDir={dir} onSort={() => {}}
    sortAscLabel="已按升序排列" sortDescLabel="已按降序排列" sortGroupLabel="排序" />);
  const mobile = html.slice(html.indexOf('role="group"'), html.indexOf("</ul>"));
  const activeButton = mobile.match(/<button[^>]*aria-pressed="true"[^>]*>(.*?)<\/button>/)?.[1];
  assert.ok(activeButton?.includes(`<span class="sr-only">${dir === "asc" ? "已按升序排列" : "已按降序排列"}</span>`), "active mobile sort exposes its direction to assistive technology");
  assert.ok(html.includes(`aria-sort="${dir === "asc" ? "ascending" : "descending"}"`), "ARIA enum remains untranslated");
}
console.log("DataTable.check OK");
