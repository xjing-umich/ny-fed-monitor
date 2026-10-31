import React from 'react';
import Link from 'next/link';

/** Keep the label readable when a historical record has no detail destination. */
export function OptionalLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return href ? <Link href={href} className={className}>{children}</Link> : <span className={className}>{children}</span>;
}
