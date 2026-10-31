"use client";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export default function ShellFrame({
  children,
  header,
  homeHeader,
  footer,
  homeFooter,
}: {
  children: ReactNode;
  header: ReactNode;
  homeHeader: ReactNode;
  footer: ReactNode;
  homeFooter: ReactNode;
}) {
  const pathname = usePathname();
  const home = /^\/(?:zh|en)?\/?$/.test(pathname);
  return (
    <div className="flex min-h-[100dvh] flex-col">
      {home ? homeHeader : header}
      <main id="main-content" className="flex-1">
        <div
          className={home ? undefined : "mx-auto max-w-5xl px-4 py-5 sm:px-6"}
        >
          {children}
        </div>
      </main>
      {home ? homeFooter : footer}
    </div>
  );
}
