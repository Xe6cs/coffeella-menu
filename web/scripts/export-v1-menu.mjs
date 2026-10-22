// Exports the original v1 menu (../menu-data.js at the repo root) into a
// reference snapshot used by the V2 app as seed data.
//
// - Names, prices and order are copied exactly as they are in v1.
// - Each category/group/product gets a slug derived deterministically from the
//   v1 ids/English names, so re-running on the same source gives the same
//   slugs. After import, the database is the source of truth: slugs live there
//   and never change when a name is edited.
// - The script fails if two products would share a slug.
//
// Usage:  node scripts/export-v1-menu.mjs [--check]
//   --check  verify the committed snapshot still matches menu-data.js (no write)

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, "../../menu-data.js");
const snapshotPath = resolve(here, "../data/menu.v1.snapshot.json");
const checkOnly = process.argv.includes("--check");

const source = readFileSync(sourcePath, "utf8");
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox, { filename: "menu-data.js" });
const menu = sandbox.window.COFFEELLA_MENU;
if (!Array.isArray(menu)) throw new Error("menu-data.js did not define window.COFFEELLA_MENU");

export function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const seen = new Set();
function unique(slug, where) {
  if (!slug) throw new Error(`Empty slug for ${where}`);
  if (seen.has(slug)) throw new Error(`Duplicate slug "${slug}" for ${where}`);
  seen.add(slug);
  return slug;
}

const categories = menu.map((cat, ci) => {
  const catSlug = unique(slugify(cat.id), `category ${ci}`);
  return {
    slug: catSlug,
    name_ar: cat.ar,
    name_en: cat.en ?? null,
    icon: cat.icon ?? null,
    photo: cat.photo || null,
    photo_focus: cat.focus || null,
    sort_order: ci + 1,
    groups: cat.groups.map((g, gi) => {
      const groupSlug = unique(`${catSlug}-${slugify(g.en || `group-${gi + 1}`)}`, `${catSlug} group ${gi}`);
      return {
        slug: groupSlug,
        name_ar: g.ar,
        name_en: g.en ?? null,
        sort_order: gi + 1,
        products: g.items.map((it, ii) => {
          const price = it.price;
          const isRange = Array.isArray(price);
          return {
            slug: unique(`${groupSlug}-${slugify(it.en || `item-${ii + 1}`)}`, `${groupSlug} item ${ii}`),
            name_ar: it.ar,
            name_en: it.en ?? null,
            price_min: isRange ? price[0] : price,
            price_max: isRange ? price[1] : null,
            sort_order: ii + 1,
          };
        }),
      };
    }),
  };
});

const counts = {
  categories: categories.length,
  groups: categories.reduce((n, c) => n + c.groups.length, 0),
  products: categories.reduce((n, c) => n + c.groups.reduce((m, g) => m + g.products.length, 0), 0),
};

const snapshot = {
  source: "menu-data.js",
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  counts,
  categories,
};
const output = JSON.stringify(snapshot, null, 2) + "\n";

if (checkOnly) {
  if (!existsSync(snapshotPath)) throw new Error("Snapshot missing: run without --check first");
  const current = readFileSync(snapshotPath, "utf8");
  if (current !== output) {
    console.error("Snapshot is out of date with menu-data.js");
    process.exit(1);
  }
  console.log(`Snapshot up to date: ${JSON.stringify(counts)}`);
} else {
  writeFileSync(snapshotPath, output);
  console.log(`Wrote ${snapshotPath}: ${JSON.stringify(counts)}`);
}
