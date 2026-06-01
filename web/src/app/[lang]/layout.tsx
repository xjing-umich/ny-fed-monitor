import { redirect } from "next/navigation";
import { buildAllSections } from "@/lib/build";
import { refreshData } from "@/app/actions";
import { getManagerIndex } from "@/lib/managers/source";
import Sidebar from "@/components/dashboard/Sidebar";
import Header from "@/components/dashboard/Header";

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

type Lang = "zh" | "en";

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") {
    redirect("/zh");
  }
  const lang = rawLang as Lang;

  // Fetch data for sidebar freshness dots and topbar AS OF
  const data = await buildAllSections();

  // Fetch manager list for 13F sidebar group
  const managerIdx = await getManagerIndex();
  const managers = [...managerIdx.managers].sort((a, b) => b.totalValue - a.totalValue);

  // Bind refreshData to current lang
  async function doRefresh() {
    "use server";
    await refreshData(lang);
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Fixed sidebar — client component, uses usePathname for active state */}
      <Sidebar lang={lang} sections={data.sections} managers={managers} />

      {/* Right column — offset by sidebar width */}
      <div
        style={{
          marginLeft: 240,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: "100vh",
          minWidth: 0,
        }}
      >
        {/* Sticky top bar */}
        <Header
          lang={lang}
          summary={data.summary}
          asOf={data.as_of}
          refreshAction={doRefresh}
        />

        {/* Page content */}
        <main style={{ flex: 1, overflowY: "auto" }}>
          <div
            style={{
              maxWidth: 1180,
              margin: "0 auto",
              padding: "20px 24px",
            }}
          >
            {children}
          </div>
        </main>

        {/* Footer */}
        <footer
          style={{
            borderTop: "1px solid var(--tt-border)",
            padding: "8px 24px",
            fontSize: 11,
            color: "var(--tt-faint)",
            textAlign: "center",
          }}
        >
          {lang === "zh"
            ? "本系统不提供交易建议 · 数据来源: NY Fed · Treasury.gov · SEC EDGAR"
            : "No trading advice · Sources: NY Fed · Treasury.gov · SEC EDGAR"}
        </footer>
      </div>
    </div>
  );
}
