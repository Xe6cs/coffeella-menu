import "server-only";
import { unstable_cache } from "next/cache";
import snapshot from "../../../data/menu.v1.snapshot.json";
import { DEFAULT_CONTACT, type ContactSettings } from "@/config/site";
import { getSupabasePublicEnv } from "@/lib/env";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { menuFromDatabase, menuFromSnapshot, type DbCategoryRow, type MenuSnapshot } from "./mappers";
import type { Menu } from "./types";

export const MENU_CACHE_TAG = "menu";
export const SETTINGS_CACHE_TAG = "settings";

const ONE_HOUR = 3600;

/**
 * Published menu for visitors. Cached and shared by everyone (revalidated
 * hourly, and immediately via revalidateTag("menu") when an admin publishes).
 *
 * Without Supabase configuration (local development) the v1 snapshot is used.
 */
export const getPublishedMenu = unstable_cache(loadPublishedMenu, ["published-menu"], {
  tags: [MENU_CACHE_TAG],
  revalidate: ONE_HOUR,
});

async function loadPublishedMenu(): Promise<Menu> {
  const env = getSupabasePublicEnv();
  if (!env) return menuFromSnapshot(snapshot as MenuSnapshot);

  const supabase = createPublicSupabaseClient(env);
  const { data, error } = await supabase
    .from("categories")
    .select(
      `id, slug, name_ar, name_en, icon, photo_path, photo_focus, sort_order,
       product_groups ( id, slug, name_ar, name_en, sort_order,
         products ( id, slug, name_ar, name_en, price_min, price_max, is_available, sort_order ) )`,
    )
    .order("sort_order");

  if (error) {
    // Logged server-side only; visitors see the generic error boundary.
    console.error("getPublishedMenu failed", { code: error.code, message: error.message });
    throw new Error("MENU_UNAVAILABLE");
  }
  return menuFromDatabase((data ?? []) as unknown as DbCategoryRow[]);
}

export const getContactSettings = unstable_cache(loadContactSettings, ["contact-settings"], {
  tags: [SETTINGS_CACHE_TAG],
  revalidate: ONE_HOUR,
});

async function loadContactSettings(): Promise<ContactSettings> {
  const env = getSupabasePublicEnv();
  if (!env) return DEFAULT_CONTACT;

  const supabase = createPublicSupabaseClient(env);
  const { data, error } = await supabase.from("site_settings").select("value").eq("key", "contact").maybeSingle();
  if (error) {
    console.error("getContactSettings failed", { code: error.code, message: error.message });
    return DEFAULT_CONTACT;
  }
  return { ...DEFAULT_CONTACT, ...((data?.value as Partial<ContactSettings>) ?? {}) };
}
