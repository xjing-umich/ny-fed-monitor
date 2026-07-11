import React from "react";

// 区块标题基元 —— 恢复本站设计语言的段落节奏:
// 绿色 mono 眉标(可选) → Sans 标题 → 内容。
// 语义标签默认 h2(文档大纲/SEO)；Fraunces 仅用于页面 H1 / 品牌。
// 分区用父级 space-y，不在此画 border-t（避免与 KeyFacts / PageHeader 叠线）。
// trailing: 标题基线右侧的可选节点(如结论徽章)。
export function SectionHeading({
  eyebrow,
  title,
  trailing,
  as: Tag = "h2",
}: {
  eyebrow?: string;
  title: string;
  trailing?: React.ReactNode;
  as?: "h2" | "h3";
}): React.ReactElement {
  // 分区靠父级 space-y，不再每节画 border-t——否则会与 KeyFacts / PageHeader
  // / 上一节底边叠成双线、三线。
  return (
    <div>
      {eyebrow && (
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Tag className="text-xl font-medium leading-tight tracking-tight text-[var(--tt-text)]">
          {title}
        </Tag>
        {trailing}
      </div>
    </div>
  );
}
