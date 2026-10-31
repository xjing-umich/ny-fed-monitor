"use client";
import { useRef, useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { Sun, Moon, Menu, X } from "lucide-react";
import { LogoMark } from "@/components/brand/Logo";
import { localePath } from "@/lib/urls";
import type { Lang } from "@/lib/nav";
import s from "./landing.module.css";
const subscribe = () => () => {};
export default function LandingHeader({ lang }: { lang: Lang }) {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const menu = useRef<HTMLDialogElement>(null);
  const zh = lang === "zh";
  const links = [
    ["/investors", zh ? "投资人" : "Investors"],
    ["/stocks", zh ? "个股" : "Stocks"],
    ["/learn", zh ? "学习" : "Learn"],
  ];
  return (
    <header className={s.header}>
      <div className={s.navInner}>
        <Link href={localePath(lang, "")} className={s.brand}>
          <LogoMark />
          <span>Compounder{zh ? " · 复利" : ""}</span>
        </Link>
        <nav
          className={s.desktopNav}
          aria-label={zh ? "主导航" : "Main navigation"}
        >
          {links.map(([path, label]) => (
            <Link key={path} href={localePath(lang, path)}>
              {label}
            </Link>
          ))}
        </nav>
        <div className={s.navTools}>
          <Link
            href={localePath(zh ? "en" : "zh", "")}
            className={s.iconButton}
            hrefLang={zh ? "en" : "zh-CN"}
            aria-label={zh ? "Switch to English" : "切换到中文"}
          >
            {zh ? "EN" : "中文"}
          </Link>
          <button
            type="button"
            className={s.iconButton}
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
            aria-label={zh ? "切换主题" : "Toggle theme"}
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun size={18} />
            ) : (
              <Moon size={18} />
            )}
          </button>
          <button
            type="button"
            className={`${s.iconButton} ${s.menuToggle}`}
            aria-label={zh ? "打开菜单" : "Open menu"}
            aria-controls="landing-menu"
            onClick={() => menu.current?.showModal()}
          >
            <Menu size={18} />
          </button>
        </div>
      </div>
      <dialog
        ref={menu}
        id="landing-menu"
        className={s.menu}
        onClick={(e) => {
          if (e.target === menu.current) {
            const r = menu.current.getBoundingClientRect();
            if (
              e.clientX < r.left ||
              e.clientX > r.right ||
              e.clientY < r.top ||
              e.clientY > r.bottom
            )
              menu.current.close();
          }
        }}
      >
        <div className={s.dialogHeading}>
          <strong>Compounder</strong>
          <button
            className={s.iconButton}
            type="button"
            onClick={() => menu.current?.close()}
            aria-label={zh ? "关闭菜单" : "Close menu"}
          >
            <X size={19} />
          </button>
        </div>
        <nav aria-label={zh ? "手机导航" : "Mobile navigation"}>
          {links.map(([path, label]) => (
            <Link
              key={path}
              href={localePath(lang, path)}
              onClick={() => menu.current?.close()}
            >
              {label}
            </Link>
          ))}
        </nav>
      </dialog>
    </header>
  );
}
