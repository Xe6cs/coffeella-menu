import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import snapshotJson from "../../../data/menu.v1.snapshot.json";
import { itemsLabel, priceLabel, priceParts } from "./format";
import { menuFromDatabase, menuFromSnapshot, photoUrl, type DbCategoryRow, type MenuSnapshot } from "./mappers";
import { countMatches, normalizeSearch, splitHighlight } from "./search";

const root = resolve(__dirname, "../../../..");
const snapshot = snapshotJson as MenuSnapshot;

type V1Item = { ar: string; en: string; price: number | [number, number] };
type V1Category = { id: string; ar: string; en: string; icon: string; photo: string; focus: string; groups: { ar: string; en: string; items: V1Item[] }[] };

function loadV1Menu(): V1Category[] {
  const sandbox: { window: { COFFEELLA_MENU?: V1Category[] } } = { window: {} };
  vm.runInNewContext(readFileSync(resolve(root, "menu-data.js"), "utf8"), sandbox);
  return sandbox.window.COFFEELLA_MENU!;
}

function loadV1Norm(): (s: string) => string {
  const src = readFileSync(resolve(root, "app.js"), "utf8");
  const fn = src.match(/function norm\(s\) \{[\s\S]*?\n {2}\}/)![0];
  return vm.runInNewContext(`(${fn})`);
}

describe("v1 snapshot", () => {
  const v1 = loadV1Menu();

  it("has the audited counts (3 / 9 / 82)", () => {
    expect(snapshot.counts).toEqual({ categories: 3, groups: 9, products: 82 });
    expect(v1.length).toBe(3);
    expect(v1.reduce((n, c) => n + c.groups.length, 0)).toBe(9);
    expect(v1.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.items.length, 0), 0)).toBe(82);
  });

  it("copies every name, price and position from menu-data.js unchanged", () => {
    snapshot.categories.forEach((c, ci) => {
      const vc = v1[ci];
      expect([c.slug, c.name_ar, c.name_en, c.icon, c.photo, c.photo_focus]).toEqual([vc.id, vc.ar, vc.en, vc.icon, vc.photo, vc.focus]);
      c.groups.forEach((g, gi) => {
        const vg = vc.groups[gi];
        expect([g.name_ar, g.name_en]).toEqual([vg.ar, vg.en]);
        expect(g.products).toHaveLength(vg.items.length);
        g.products.forEach((p, pi) => {
          const vi = vg.items[pi];
          expect([p.name_ar, p.name_en]).toEqual([vi.ar, vi.en]);
          if (Array.isArray(vi.price)) expect([p.price_min, p.price_max]).toEqual(vi.price);
          else expect([p.price_min, p.price_max]).toEqual([vi.price, null]);
        });
      });
    });
  });

  it("gives every product a unique, URL-safe slug", () => {
    const slugs = snapshot.categories.flatMap((c) => c.groups.flatMap((g) => g.products.map((p) => p.slug)));
    expect(new Set(slugs).size).toBe(82);
    for (const s of slugs) expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});

describe("search", () => {
  const menu = menuFromSnapshot(snapshot);

  it("normalizes exactly like the v1 site for every product and query", () => {
    const v1Norm = loadV1Norm();
    const samples = menu.categories.flatMap((c) =>
      c.groups.flatMap((g) => g.products.flatMap((p) => [p.nameAr, p.nameEn ?? "", `${c.nameAr} ${g.nameAr}`, `${c.nameEn} ${g.nameEn}`])),
    );
    samples.push("آيس", "أمريكانو", "إسبريسو", "فراولة", "ماتشا بنك", "قهوه", "Frappé", "Nescafé", "سَموذي", "لاتيـــه", "  latte  ");
    for (const s of samples) expect(normalizeSearch(s), s).toBe(v1Norm(s));
  });

  it.each([
    ["", 82], ["latte", 6], ["لاتيه", 6], ["ايس", 5], ["frappe", 4], ["smoothie", 6],
    ["تشيز كيك", 12], ["كرواسون", 5], ["سموذى", 6], ["قهوه", 27], ["nescafe", 3], ["zzz", 0],
  ])("query %j matches %i products (audit baseline)", (query, expected) => {
    expect(countMatches(menu.categories, query)).toBe(expected);
  });

  it("highlights the first case-insensitive match", () => {
    expect(splitHighlight("Spanish Latte", "latte")).toEqual(["Spanish ", "Latte", ""]);
    expect(splitHighlight("Latte", "")).toBeNull();
    expect(splitHighlight("Latte", "mocha")).toBeNull();
  });
});

describe("format", () => {
  it("formats single prices and ranges like v1", () => {
    expect(priceParts(3000, null)).toEqual(["3,000"]);
    expect(priceParts(4000, 5000)).toEqual(["4,000", "5,000"]);
    expect(priceLabel(3000, null)).toBe("3,000 دينار");
    expect(priceLabel(4000, 5000)).toBe("من 4,000 إلى 5,000 دينار");
  });

  it("uses correct Arabic number agreement", () => {
    expect([1, 2, 3, 10, 11, 82].map(itemsLabel)).toEqual(["صنف واحد", "صنفان", "3 أصناف", "10 أصناف", "11 صنفاً", "82 صنفاً"]);
  });
});

describe("mappers", () => {
  it("orders database rows by sort_order at every level", () => {
    const rows: DbCategoryRow[] = [
      { id: "c2", slug: "b", name_ar: "ب", name_en: null, icon: null, photo_path: null, photo_focus: null, sort_order: 2, product_groups: [] },
      {
        id: "c1", slug: "a", name_ar: "أ", name_en: "A", icon: "hot", photo_path: "assets/hot.jpg", photo_focus: null, sort_order: 1,
        product_groups: [
          { id: "g2", slug: "a-2", name_ar: "٢", name_en: null, sort_order: 2, products: [] },
          {
            id: "g1", slug: "a-1", name_ar: "١", name_en: null, sort_order: 1,
            products: [
              { id: "p2", slug: "x2", name_ar: "ب", name_en: null, price_min: 2, price_max: null, is_available: true, sort_order: 2 },
              { id: "p1", slug: "x1", name_ar: "أ", name_en: null, price_min: 1, price_max: 3, is_available: false, sort_order: 1 },
            ],
          },
        ],
      },
    ];
    const menu = menuFromDatabase(rows);
    expect(menu.categories.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(menu.categories[0].groups.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(menu.categories[0].groups[0].products.map((p) => [p.id, p.priceMin, p.priceMax, p.isAvailable])).toEqual([
      ["p1", 1, 3, false],
      ["p2", 2, null, true],
    ]);
  });

  it("resolves photo paths safely", () => {
    expect(photoUrl("assets/hot.jpg")).toBe("/assets/hot.jpg");
    expect(photoUrl("https://x.supabase.co/storage/v1/object/public/menu-images/a.jpg")).toContain("https://");
    expect(photoUrl("menu-images/a.jpg", "https://x.supabase.co/storage/v1/object/public/")).toBe(
      "https://x.supabase.co/storage/v1/object/public/menu-images/a.jpg",
    );
    expect(photoUrl("javascript:alert(1)")).toBeNull();
    expect(photoUrl(null)).toBeNull();
  });
});
