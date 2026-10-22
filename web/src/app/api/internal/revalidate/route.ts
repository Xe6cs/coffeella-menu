import { revalidatePath, revalidateTag } from "next/cache";
import { decideRevalidation } from "@/lib/cache/revalidate-request";

/**
 * POST /api/internal/revalidate
 * Authorization: Bearer <REVALIDATE_SECRET>
 * Body (optional): { "tags": ["menu", "settings"] }
 *
 * Marks the public menu/settings caches as stale so the next visitor gets
 * fresh data. Disabled (404) unless REVALIDATE_SECRET is set (>= 32 chars).
 */
export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const decision = decideRevalidation({
    configuredSecret: process.env.REVALIDATE_SECRET,
    authorizationHeader: request.headers.get("authorization"),
    body,
  });

  if (decision.status === 404) return new Response("Not Found", { status: 404 });
  if (decision.status === 401) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (decision.status === 400) return Response.json({ error: decision.error }, { status: 400 });

  // Prices must not be served stale after a publish: expire immediately so the
  // next request renders fresh data instead of stale-while-revalidate.
  for (const tag of decision.tags) revalidateTag(tag, { expire: 0 });
  revalidatePath("/");

  return Response.json({ revalidated: decision.tags });
}
