/**
 * Validation for the internal revalidation endpoint (/api/internal/revalidate).
 * Callers: Supabase Database Webhooks on menu/settings tables, and the admin
 * panel after publishing. Pure functions so they can be unit-tested.
 */

export const REVALIDATABLE_TAGS = ["menu", "settings"] as const;
export type RevalidatableTag = (typeof REVALIDATABLE_TAGS)[number];

/** Minimum secret length; shorter secrets disable the endpoint. */
export const MIN_SECRET_LENGTH = 32;

/** Constant-time string comparison (does not leak where strings differ). */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  const len = Math.max(x.length, y.length);
  for (let i = 0; i < len; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

export type RevalidateDecision =
  | { status: 404 }
  | { status: 401 }
  | { status: 400; error: string }
  | { status: 200; tags: RevalidatableTag[] };

export function decideRevalidation(input: {
  configuredSecret: string | undefined;
  authorizationHeader: string | null;
  body: unknown;
}): RevalidateDecision {
  const secret = input.configuredSecret;
  if (!secret || secret.length < MIN_SECRET_LENGTH) return { status: 404 };

  const header = input.authorizationHeader ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  if (!safeEqual(token, secret)) return { status: 401 };

  const requested =
    input.body && typeof input.body === "object" && Array.isArray((input.body as { tags?: unknown }).tags)
      ? ((input.body as { tags: unknown[] }).tags as unknown[])
      : [...REVALIDATABLE_TAGS]; // e.g. a Supabase webhook payload: refresh everything public
  const tags = [...new Set(requested)].filter((t): t is RevalidatableTag =>
    (REVALIDATABLE_TAGS as readonly unknown[]).includes(t),
  );
  if (tags.length === 0) return { status: 400, error: "no valid tags" };
  return { status: 200, tags };
}
