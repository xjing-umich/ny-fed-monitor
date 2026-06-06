import Link from "next/link";

type Lang = "zh" | "en";

export type RelatedItem = { label: string; href: string };

export type RelatedLinksProps = {
  lang: Lang;
  items?: RelatedItem[];
};

export function RelatedLinks({ lang, items }: RelatedLinksProps) {
  if (!items?.length) return null;

  const heading = lang === "zh" ? "相关页面" : "Related";

  return (
    <div className="space-y-2">
      <p className="tt-faint-label">{heading}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="text-sm text-primary underline-offset-2 hover:underline"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
