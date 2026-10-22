import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SupabasePublicEnv } from "@/lib/env";

/**
 * Cookie-less client with the publishable key: reads exactly what an anonymous
 * visitor may read (RLS "anon"). Safe to use inside "use cache" functions
 * because it never touches the request.
 */
export function createPublicSupabaseClient(env: SupabasePublicEnv) {
  return createClient(env.url, env.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
