import Link from "next/link";

export default function FeatureRow({
  eyebrow,
  title,
  body,
  ctaLabel,
  href,
  reverse = false,
  children,
}: {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  reverse?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-24 grid grid-cols-1 items-center gap-10 md:grid-cols-2">
      <div className={reverse ? "md:order-2" : ""}>
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
        <h2 className="mt-3 font-display text-2xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-3xl">
          {title}
        </h2>
        <p className="mt-3 max-w-[42ch] text-sm leading-relaxed text-[var(--tt-muted)]">{body}</p>
        <Link
          href={href}
          className="mt-5 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {ctaLabel}
        </Link>
      </div>
      <div className={reverse ? "md:order-1" : ""}>{children}</div>
    </section>
  );
}
