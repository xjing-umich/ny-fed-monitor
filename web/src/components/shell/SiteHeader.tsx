"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { PRIMARY_NAV, isNavActive, type Lang } from "@/lib/nav";
import { localePath, HTML_LANG } from "@/lib/urls";
import type { SearchIndex } from "@/lib/search/types";
import { switchLangKeepingQuery } from "./langSwitch";
import GlobalSearch from "./GlobalSearch";
import s from "./siteHeader.module.css";
const subscribe = () => () => {};

export default function SiteHeader({
  lang,
  index,
}: {
  lang: Lang;
  index: SearchIndex;
}) {
  const pathname = usePathname(),
    router = useRouter(),
    { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
      subscribe,
      () => true,
      () => false,
    ),
    id = useId();
  const menu = useRef<HTMLDialogElement>(null),
    [menuOpen, setMenuOpen] = useState(false);
  const bare = pathname.replace(/^\/(zh|en)(?=\/|$)/, ""),
    home = bare === "" || bare === "/";
  const zh = lang === "zh",
    other: Lang = zh ? "en" : "zh",
    otherPath = localePath(other, bare);
  const close = () => menu.current?.close();
  useEffect(() => {
    if (menuOpen) {
      menu.current?.showModal();
      menu.current?.querySelector("input")?.focus();
    }
  }, [menuOpen]);
  useEffect(() => {
    menu.current?.close();
  }, [pathname]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) menu.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  return (
    <header className={s.header} data-site-header>
      <div className={s.inner}>
        <Link
          href={localePath(lang, "")}
          className={s.brand}
          aria-label={zh ? "Compounder · 复利，返回首页" : "Compounder, home"}
        >
          <LogoMark />
          <span>
            Compounder<span className={s.brandCn}>{zh ? " · 复利" : ""}</span>
          </span>
        </Link>
        <nav className={s.nav} aria-label={zh ? "主导航" : "Main navigation"}>
          {PRIMARY_NAV.map((entry) => (
            <Link
              key={entry.key}
              href={localePath(lang, entry.href)}
              aria-current={
                isNavActive(entry.key, entry.href, bare) ? "page" : undefined
              }
            >
              {entry[lang]}
            </Link>
          ))}
        </nav>
        {!home && (
          <div className={s.headerSearch}>
            <GlobalSearch key={pathname} lang={lang} index={index} />
          </div>
        )}
        <div className={s.tools}>
          <Link
            className={s.iconButton}
            href={otherPath}
            hrefLang={HTML_LANG[other]}
            lang={HTML_LANG[other]}
            aria-label={zh ? "Switch to English" : "切换到中文"}
            onClick={(e) => switchLangKeepingQuery(e, otherPath, router.push)}
            onAuxClick={(e) =>
              switchLangKeepingQuery(e, otherPath, router.push)
            }
            onContextMenu={(e) =>
              switchLangKeepingQuery(e, otherPath, router.push)
            }
          >
            {zh ? "EN" : "中文"}
          </Link>
          <button
            className={s.iconButton}
            type="button"
            aria-label={zh ? "切换主题" : "Toggle theme"}
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}
          </button>
          <button
            className={`${s.iconButton} ${s.menuToggle}`}
            type="button"
            aria-label={zh ? "打开菜单" : "Open menu"}
            aria-controls={id}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={19} />
          </button>
        </div>
      </div>
      <dialog
        ref={menu}
        id={id}
        aria-label={zh ? "导航菜单" : "Navigation menu"}
        className={s.menu}
        onClose={() => setMenuOpen(false)}
        onClick={(e) => {
          if (e.target === menu.current) {
            const r = menu.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              close();
          }
        }}
      >
        <div className={s.menuHeading}>
          <strong>{zh ? "搜索与导航" : "Search & navigation"}</strong>
          <button
            className={s.iconButton}
            type="button"
            aria-label={zh ? "关闭菜单" : "Close menu"}
            onClick={close}
          >
            <X size={19} />
          </button>
        </div>
        {menuOpen && (
          <GlobalSearch
            lang={lang}
            index={index}
            variant="menu"
            onNavigate={close}
          />
        )}
        <nav
          className={s.menuNav}
          aria-label={zh ? "手机导航" : "Mobile navigation"}
        >
          {PRIMARY_NAV.map((entry) => (
            <Link
              key={entry.key}
              href={localePath(lang, entry.href)}
              aria-current={
                isNavActive(entry.key, entry.href, bare) ? "page" : undefined
              }
              onClick={close}
            >
              {entry[lang]}
            </Link>
          ))}
        </nav>
      </dialog>
    </header>
  );
}
