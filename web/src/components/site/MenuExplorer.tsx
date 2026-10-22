"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { priceLabel, priceParts } from "@/lib/menu/format";
import { matchesTokens, productSearchKey, searchTokens, splitHighlight } from "@/lib/menu/search";
import type { MenuCategory } from "@/lib/menu/types";
import { Icon } from "./IconSprite";

function Highlight({ text, query }: { text: string; query: string }) {
  const parts = splitHighlight(text, query);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark>{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

/**
 * Search toolbar, category tabs and the menu sections — a React port of the v1
 * app.js behaviour (same markup, classes and interactions).
 */
export function MenuExplorer({ categories }: { categories: MenuCategory[] }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState("top");
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const tabsRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const stickyOffset = useRef(140);
  const firstQuery = useRef(true);

  // Search keys are computed once per menu.
  const keys = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories)
      for (const g of c.groups)
        for (const p of g.products)
          map.set(p.id, productSearchKey(p, { categoryAr: c.nameAr, categoryEn: c.nameEn, groupAr: g.nameAr, groupEn: g.nameEn }));
    return map;
  }, [categories]);

  const tokens = useMemo(() => searchTokens(query), [query]);

  const visibility = useMemo(() => {
    const products = new Set<string>();
    const groupCount = new Map<string, number>();
    const sectionCount = new Map<string, number>();
    let total = 0;
    for (const c of categories) {
      let sc = 0;
      for (const g of c.groups) {
        let gc = 0;
        for (const p of g.products) {
          if (matchesTokens(keys.get(p.id) ?? "", tokens)) {
            products.add(p.id);
            gc += 1;
          }
        }
        groupCount.set(g.id, gc);
        sc += gc;
      }
      sectionCount.set(c.id, sc);
      total += sc;
    }
    return { products, groupCount, sectionCount, total };
  }, [categories, keys, tokens]);

  // ---- sticky offset (header + toolbar) ----
  const measure = useCallback(() => {
    const header = document.querySelector<HTMLElement>(".header");
    const toolbar = toolbarRef.current;
    if (!header || !toolbar) return;
    const off = header.offsetHeight + toolbar.offsetHeight + 8;
    document.documentElement.style.setProperty("--toolbar-top", `${header.offsetHeight}px`);
    document.documentElement.style.setProperty("--sticky-offset", `${off}px`);
    stickyOffset.current = off;
  }, []);

  // ---- scroll spy ----
  const updateActive = useCallback(() => {
    let current = "top";
    for (const c of categories) {
      const el = sectionRefs.current.get(c.slug);
      if (!el || el.hidden) continue;
      if (el.getBoundingClientRect().top <= stickyOffset.current + 24) current = c.slug;
    }
    setActive((prev) => (prev === current ? prev : current));
  }, [categories]);

  useEffect(() => {
    measure();
    const initial = requestAnimationFrame(updateActive);
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateActive();
        ticking = false;
      });
    };
    const onResize = () => {
      measure();
      updateActive();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      cancelAnimationFrame(initial);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
    };
  }, [measure, updateActive]);

  // Reflect the active section in the header nav and keep the active tab visible.
  useEffect(() => {
    document.querySelectorAll<HTMLAnchorElement>(".nav__link").forEach((a) => {
      a.classList.toggle("is-active", a.getAttribute("href") === `#${active}`);
    });
    const tabs = tabsRef.current;
    const tab = tabs?.querySelector<HTMLElement>(`[data-target="${active}"]`);
    if (tabs && tab) {
      const tr = tab.getBoundingClientRect();
      const cr = tabs.getBoundingClientRect();
      if (tr.left < cr.left) tabs.scrollBy({ left: tr.left - cr.left - 16, behavior: "smooth" });
      else if (tr.right > cr.right) tabs.scrollBy({ left: tr.right - cr.right + 16, behavior: "smooth" });
    }
  }, [active]);

  // When searching while scrolled down, jump back to the top of the results.
  useEffect(() => {
    if (firstQuery.current) {
      firstQuery.current = false;
      return;
    }
    const menu = menuRef.current;
    const header = document.querySelector<HTMLElement>(".header");
    if (menu && header) {
      const top = window.scrollY + menu.getBoundingClientRect().top + parseFloat(getComputedStyle(menu).paddingTop) - header.offsetHeight;
      if (window.scrollY > top) window.scrollTo({ top, behavior: "instant" });
    }
    const frame = requestAnimationFrame(updateActive);
    return () => cancelAnimationFrame(frame);
  }, [query, updateActive]);

  const reset = () => setQuery("");
  const q = query.trim();

  return (
    <section className="menu" id="menu" aria-label="القائمة" ref={menuRef}>
      <div className="toolbar" ref={toolbarRef}>
        <div className="container toolbar__inner">
          <label className="search">
            <Icon name="search" />
            <input
              ref={searchRef}
              id="search"
              type="search"
              placeholder="ابحث عن مشروب أو حلوى…"
              autoComplete="off"
              aria-label="ابحث في القائمة"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") reset();
              }}
            />
            <button
              type="button"
              className="search__clear"
              aria-label="مسح البحث"
              hidden={q.length === 0}
              onClick={() => {
                reset();
                searchRef.current?.focus();
              }}
            >
              <Icon name="x" />
            </button>
          </label>
          <nav className="tabs" aria-label="التنقل بين الأقسام" ref={tabsRef}>
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                className={active === c.slug ? "tab is-active" : "tab"}
                data-target={c.slug}
                aria-current={active === c.slug ? "true" : undefined}
                disabled={(visibility.sectionCount.get(c.id) ?? 0) === 0}
                onClick={() => sectionRefs.current.get(c.slug)?.scrollIntoView({ behavior: "smooth", block: "start" })}
              >
                <Icon name={c.icon ?? "hot"} className="" />
                <span>{c.nameAr}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="container">
        <p className="menu__note">جميع الأسعار بالدينار العراقي (د.ع)</p>
        <div id="sections">
          {categories.map((c) => (
            <section
              key={c.id}
              className="section"
              id={c.slug}
              aria-labelledby={`h-${c.slug}`}
              hidden={(visibility.sectionCount.get(c.id) ?? 0) === 0}
              ref={(el) => {
                if (el) sectionRefs.current.set(c.slug, el);
                else sectionRefs.current.delete(c.slug);
              }}
            >
              <header className="section__head">
                <span className="section__icon">
                  <Icon name={c.icon ?? "hot"} className="" />
                </span>
                <h2 className="section__title" id={`h-${c.slug}`}>
                  {c.nameAr}
                  {c.nameEn && (
                    <span className="section__en" lang="en">
                      {c.nameEn}
                    </span>
                  )}
                </h2>
              </header>
              {c.groups.map((g) => (
                <div className="group" key={g.id} hidden={(visibility.groupCount.get(g.id) ?? 0) === 0}>
                  <h3 className="group__head">
                    {g.nameAr}{" "}
                    {g.nameEn && (
                      <span className="group__en" lang="en">
                        {g.nameEn}
                      </span>
                    )}
                  </h3>
                  <ul className="items">
                    {g.products.map((p) => (
                      <li className="item" key={p.id} hidden={!visibility.products.has(p.id)}>
                        <span className="item__names">
                          <span className="item__ar">
                            <Highlight text={p.nameAr} query={q} />
                          </span>
                          {p.nameEn && (
                            <span className="item__en" lang="en" dir="ltr">
                              <Highlight text={p.nameEn} query={q} />
                            </span>
                          )}
                        </span>
                        <span className="item__leader" aria-hidden="true" />
                        <span className="item__price" dir="ltr" aria-label={priceLabel(p.priceMin, p.priceMax)}>
                          {priceParts(p.priceMin, p.priceMax).map((part, i) => (
                            <span key={i}>
                              {i > 0 && <small>–</small>}
                              {part}
                            </span>
                          ))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="empty" hidden={visibility.total > 0}>
          <p>
            لا توجد نتائج مطابقة لـ «<span>{q}</span>»
          </p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            عرض القائمة كاملة
          </button>
        </div>
      </div>
    </section>
  );
}
