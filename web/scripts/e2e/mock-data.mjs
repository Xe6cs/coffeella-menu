// Shared fake Supabase REST responses for cache/revalidation tests.
// Used by the local Node mock (mock-supabase.mjs) and by the mock database
// Worker deployed with the Cloudflare preview (cloudflare/mock-db/worker.mjs).
// Contains only public menu data from data/menu.v1.snapshot.json — no secrets.
import snapshot from "../../data/menu.v1.snapshot.json" with { type: "json" };

export const MOCK_CONTACT = {
  address_ar: "بغداد – حي الجامعة – فرع شركة كري الأرض الصلبة",
  phone_display: "0787 001 0580",
  phone_e164: "+9647870010580",
  whatsapp_url: "https://wa.me/9647870010580",
  instagram_url: "https://www.instagram.com/coffeella.cafe",
  instagram_handle: "@coffeella.cafe",
};

/** Rows in the shape returned by the nested PostgREST select in repository.ts. */
export function mockCategories(priceOverrides = new Map()) {
  return snapshot.categories.map((c) => ({
    id: c.slug, slug: c.slug, name_ar: c.name_ar, name_en: c.name_en, icon: c.icon,
    photo_path: c.photo, photo_focus: c.photo_focus, sort_order: c.sort_order,
    product_groups: c.groups.map((g) => ({
      id: g.slug, slug: g.slug, name_ar: g.name_ar, name_en: g.name_en, sort_order: g.sort_order,
      products: g.products.map((p) => ({
        id: p.slug, slug: p.slug, name_ar: p.name_ar, name_en: p.name_en,
        price_min: priceOverrides.get(p.slug) ?? p.price_min, price_max: p.price_max,
        is_available: true, sort_order: p.sort_order,
      })),
    })),
  }));
}

/** PostgREST returns an object for single-row requests, an array otherwise. */
export function mockSettingsBody(acceptHeader) {
  const row = { value: MOCK_CONTACT };
  return String(acceptHeader ?? "").includes("vnd.pgrst.object") ? row : [row];
}

export const KNOWN_SLUGS = new Set(snapshot.categories.flatMap((c) => c.groups.flatMap((g) => g.products.map((p) => p.slug))));
