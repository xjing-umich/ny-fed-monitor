import React from "react";

// 区块标题基元 —— 恢复本站设计语言的段落节奏:
// 绿色 mono 眉标(可选) → 大号 Fraunces 标题 → 内容。
// 语义标签默认 h2(文档大纲/SEO), 视觉由 Fraunces 承载, 取代此前被压成 10px faint
// 全大写"伪眉标"的做法(那让整页只剩小号全大写标签、无展示体锚点)。
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
  return (
    <div className="border-t border-[var(--tt-border)] pt-5">
      {eyebrow && (
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
          {eyebrow}
        </p>
      )}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Tag className="font-display text-xl font-medium leading-tight tracking-tight text-[var(--tt-text)]">
          {title}
        </Tag>
        {trailing}
      </div>
    </div>
  );
}
