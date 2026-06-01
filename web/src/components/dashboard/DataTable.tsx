import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TableT } from "@/lib/types";
import { tablePreviewCount } from "@/lib/dashboard";

type Lang = "zh" | "en";

const COLUMN_LABELS_ZH: Record<string, string> = {
  // Auction columns
  auction_date: "拍卖日期",
  auctionDate: "拍卖日期",
  security_type: "证券类型",
  securityType: "证券类型",
  term: "期限",
  offering_amount: "发行规模",
  offeringAmount: "发行规模",
  issue_date: "发行日期",
  issueDate: "发行日期",
  bid_to_cover: "投标倍数",
  bidToCover: "投标倍数",
  primary_dealer_share: "主要交易商份额",
  primaryDealerShare: "主要交易商份额",
  indirect_bidder_share: "间接投标人份额",
  indirectBidderShare: "间接投标人份额",
  // Repo / facility columns
  date: "日期",
  facility: "工具",
  operation_type: "操作类型",
  operationType: "操作类型",
  accepted_amount: "接受金额",
  acceptedAmount: "接受金额",
  submitted_amount: "提交金额",
  submittedAmount: "提交金额",
  rate: "利率",
  counterparty_count: "交易对手数量",
  counterpartyCount: "交易对手数量",
  maturity_date: "到期日",
  maturityDate: "到期日",
  description: "描述",
  // Reference rates
  rate_name: "利率名称",
  rateName: "利率名称",
  rate_percent: "利率 (%)",
  ratePercent: "利率 (%)",
  volume: "成交量",
  // General
  metric: "指标",
  source: "来源",
  latest_date: "最新日期",
  latestDate: "最新日期",
  formatted_value: "格式化数值",
  formattedValue: "格式化数值",
  status: "状态",
  value: "数值",
  category: "类别",
  par_value: "面值",
  parValue: "面值",
  label: "标签",
  // Market share
  security: "证券",
  sector: "板块",
  trade_channel: "交易渠道",
  tradeChannel: "交易渠道",
  frequency: "频率",
  period_or_release_date: "期间 / 发布日期",
  daily_avg_volume_millions: "日均成交量 (百万)",
};

function translateHeader(key: string, lang: Lang): string {
  if (lang === "zh") {
    return COLUMN_LABELS_ZH[key] ?? key;
  }
  // English: convert snake_case / camelCase to Title Case
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function TableView({
  rows,
  lang,
  emptyLabel,
}: {
  rows: Record<string, unknown>[];
  lang: Lang;
  emptyLabel: string;
}) {
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground py-2">{emptyLabel}</p>;
  }
  const columns = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {columns.map((col) => (
              <TableHead key={col} className="text-xs font-semibold whitespace-nowrap">
                {translateHeader(col, lang)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i} className="hover:bg-muted/30">
              {columns.map((col) => (
                <TableCell key={col} className="tnum text-xs py-2 whitespace-nowrap">
                  {String(row[col] ?? "—")}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function DataTable({
  table,
  lang,
  showFullLabel,
  emptyLabel,
}: {
  table: TableT;
  lang: Lang;
  showFullLabel: string;
  emptyLabel: string;
}) {
  const rows = table.rows ?? [];
  const previewCount = tablePreviewCount(table.title);
  const previewRows = rows.slice(0, previewCount);
  const overflowRows = rows.slice(previewCount);
  const hasOverflow = overflowRows.length > 0;
  const title = lang === "zh" ? (table.title_zh ?? table.title) : table.title;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold text-card-foreground">{title}</h4>
      {!rows.length ? (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <>
          <TableView rows={previewRows} lang={lang} emptyLabel={emptyLabel} />
          {hasOverflow && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-primary hover:underline select-none py-1">
                {showFullLabel} ({overflowRows.length} {lang === "zh" ? "更多行" : "more rows"})
              </summary>
              <div className="mt-2">
                <TableView rows={rows} lang={lang} emptyLabel={emptyLabel} />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
