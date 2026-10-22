import type { Menu, MenuCategory } from "./types";

/** Shape of data/menu.v1.snapshot.json */
export type MenuSnapshot = {
  source: string;
  sourceSha256: string;
  counts: { categories: number; groups: number; products: number };
  categories: {
    slug: string;
    name_ar: string;
    name_en: string | null;
    icon: string | null;
    photo: string | null;
    photo_focus: string | null;
    sort_order: number;
    groups: {
      slug: string;
      name_ar: string;
      name_en: string | null;
      sort_order: number;
      products: {
        slug: string;
        name_ar: string;
        name_en: string | null;
        price_min: number;
        price_max: number | null;
        sort_order: number;
      }[];
    }[];
  }[];
};

export function menuFromSnapshot(snapshot: MenuSnapshot): Menu {
  return {
    source: "snapshot",
    categories: snapshot.categories.map((c) => ({
      id: c.slug,
      slug: c.slug,
      nameAr: c.name_ar,
      nameEn: c.name_en,
      icon: c.icon,
      photo: c.photo,
      photoFocus: c.photo_focus,
      groups: c.groups.map((g) => ({
        id: g.slug,
        slug: g.slug,
        nameAr: g.name_ar,
        nameEn: g.name_en,
        products: g.products.map((p) => ({
          id: p.slug,
          slug: p.slug,
          nameAr: p.name_ar,
          nameEn: p.name_en,
          priceMin: p.price_min,
          priceMax: p.price_max,
          isAvailable: true,
        })),
      })),
    })),
  };
}

/** Row shape returned by the nested Supabase select in repository.ts */
export type DbCategoryRow = {
  id: string;
  slug: string;
  name_ar: string;
  name_en: string | null;
  icon: string | null;
  photo_path: string | null;
  photo_focus: string | null;
  sort_order: number;
  product_groups: {
    id: string;
    slug: string;
    name_ar: string;
    name_en: string | null;
    sort_order: number;
    products: {
      id: string;
      slug: string;
      name_ar: string;
      name_en: string | null;
      price_min: number;
      price_max: number | null;
      is_available: boolean;
      sort_order: number;
    }[];
  }[];
};

const bySortOrder = <T extends { sort_order: number }>(a: T, b: T) => a.sort_order - b.sort_order;

export function menuFromDatabase(rows: DbCategoryRow[]): Menu {
  const categories: MenuCategory[] = [...rows].sort(bySortOrder).map((c) => ({
    id: c.id,
    slug: c.slug,
    nameAr: c.name_ar,
    nameEn: c.name_en,
    icon: c.icon,
    photo: c.photo_path,
    photoFocus: c.photo_focus,
    groups: [...c.product_groups].sort(bySortOrder).map((g) => ({
      id: g.id,
      slug: g.slug,
      nameAr: g.name_ar,
      nameEn: g.name_en,
      products: [...g.products].sort(bySortOrder).map((p) => ({
        id: p.id,
        slug: p.slug,
        nameAr: p.name_ar,
        nameEn: p.name_en,
        priceMin: p.price_min,
        priceMax: p.price_max,
        isAvailable: p.is_available,
      })),
    })),
  }));
  return { source: "database", categories };
}

/** Resolves a stored photo path to a URL (v1 paths like "assets/hot.jpg" are served from /public). */
export function photoUrl(path: string | null, storageBaseUrl?: string): string | null {
  if (!path) return null;
  if (/^https:\/\//.test(path)) return path;
  if (path.startsWith("assets/")) return `/${path}`;
  return storageBaseUrl ? `${storageBaseUrl.replace(/\/$/, "")}/${path}` : null;
}
