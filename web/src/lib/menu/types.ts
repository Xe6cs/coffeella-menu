export type MenuProduct = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  /** Single price, or the lower bound of a price range (kept exactly as in v1). */
  priceMin: number;
  /** Upper bound when the product has a price range, otherwise null. */
  priceMax: number | null;
  isAvailable: boolean;
};

export type MenuGroup = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  products: MenuProduct[];
};

export type MenuCategory = {
  id: string;
  slug: string;
  nameAr: string;
  nameEn: string | null;
  icon: string | null;
  photo: string | null;
  photoFocus: string | null;
  groups: MenuGroup[];
};

export type MenuSource = "database" | "snapshot";

export type Menu = {
  categories: MenuCategory[];
  source: MenuSource;
};
