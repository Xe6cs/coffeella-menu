import type { MenuCategory } from "./types";

/**
 * Normalizes text for menu search (same rules as the v1 site):
 * lower-case, strip Latin accents and Arabic diacritics/tatweel, unify
 * alef forms, taa marbuta -> haa, alef maqsura -> yaa, hamza carriers,
 * and collapse anything that is not a letter or digit into one space.
 *
 * Escapes are written as \uXXXX on purpose: literal combining marks in
 * source code are invisible and easy to corrupt in editors.
 */
export function normalizeSearch(text: string): string {
  return String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627") // alef forms -> bare alef
    .replace(/\u0629/g, "\u0647") // taa marbuta -> haa
    .replace(/\u0649/g, "\u064a") // alef maqsura -> yaa
    .replace(/\u0624/g, "\u0648") // waw with hamza -> waw
    .replace(/\u0626/g, "\u064a") // yaa with hamza -> yaa
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  return normalizeSearch(query).split(" ").filter(Boolean);
}

/** Search key for a product: its names plus its category and group names. */
export function productSearchKey(
  product: { nameAr: string; nameEn: string | null },
  context: { categoryAr: string; categoryEn: string | null; groupAr: string; groupEn: string | null },
): string {
  return normalizeSearch(
    [product.nameAr, product.nameEn, context.categoryAr, context.categoryEn, context.groupAr, context.groupEn]
      .filter(Boolean)
      .join(" "),
  );
}

export function matchesTokens(key: string, tokens: string[]): boolean {
  return tokens.every((t) => key.includes(t));
}

/** Number of products matching a query (used by tests and the empty state). */
export function countMatches(categories: MenuCategory[], query: string): number {
  const tokens = searchTokens(query);
  let n = 0;
  for (const c of categories) {
    for (const g of c.groups) {
      for (const p of g.products) {
        const key = productSearchKey(p, { categoryAr: c.nameAr, categoryEn: c.nameEn, groupAr: g.nameAr, groupEn: g.nameEn });
        if (matchesTokens(key, tokens)) n += 1;
      }
    }
  }
  return n;
}

/** Splits text around the first case-insensitive occurrence of query (for highlighting). */
export function splitHighlight(text: string, query: string): [string, string, string] | null {
  const q = query.trim();
  if (!q) return null;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  return [text.slice(0, i), text.slice(i, i + q.length), text.slice(i + q.length)];
}
