/**
 * Fallback site settings, identical to the v1 site. The live values come from
 * the `site_settings` table ("contact" key); these are used when Supabase is
 * not configured (local development) and as the seed for that table.
 */
export type ContactSettings = {
  address_ar: string;
  phone_display: string;
  phone_e164: string;
  whatsapp_url: string;
  instagram_url: string;
  instagram_handle: string;
};

export const DEFAULT_CONTACT: ContactSettings = {
  address_ar: "بغداد – حي الجامعة – فرع شركة كري الأرض الصلبة",
  phone_display: "0787 001 0580",
  phone_e164: "+9647870010580",
  whatsapp_url: "https://wa.me/9647870010580",
  instagram_url: "https://www.instagram.com/coffeella.cafe",
  instagram_handle: "@coffeella.cafe",
};

/** Header navigation labels exactly as in v1 (the desserts link reads "حلويات"). */
export const SITE_NAV: { href: string; label: string }[] = [
  { href: "#top", label: "الصفحة الرئيسية" },
  { href: "#hot", label: "مشروبات ساخنة" },
  { href: "#cold", label: "مشروبات باردة" },
  { href: "#desserts", label: "حلويات" },
];
