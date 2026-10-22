// Mock "Supabase REST" Worker for the Cloudflare preview test only.
// Serves the public menu from the v1 snapshot (no real database, no secrets)
// and lets the test script change a price to simulate an admin publishing.
//
// Public:   GET  /rest/v1/categories, GET /rest/v1/site_settings
// Control:  POST /__control/price {slug, price_min}, POST /__control/reset,
//           GET  /__control/stats       (Authorization: Bearer MOCK_CONTROL_TOKEN)
import { DurableObject } from "cloudflare:workers";
import { KNOWN_SLUGS, mockCategories, mockSettingsBody } from "../../scripts/e2e/mock-data.mjs";

export class MockState extends DurableObject {
  async read(kind) {
    const stats = (await this.ctx.storage.get("stats")) ?? { categories: 0, settings: 0 };
    stats[kind] = (stats[kind] ?? 0) + 1;
    await this.ctx.storage.put("stats", stats);
    return (await this.ctx.storage.get("overrides")) ?? {};
  }
  async setPrice(slug, price) {
    const overrides = (await this.ctx.storage.get("overrides")) ?? {};
    overrides[slug] = price;
    await this.ctx.storage.put("overrides", overrides);
  }
  async reset() {
    await this.ctx.storage.deleteAll();
  }
  async stats() {
    return { stats: (await this.ctx.storage.get("stats")) ?? { categories: 0, settings: 0 }, overrides: (await this.ctx.storage.get("overrides")) ?? {} };
  }
}

const HEADERS = { "content-type": "application/json; charset=utf-8", "x-robots-tag": "noindex, nofollow", "cache-control": "no-store" };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: HEADERS });

function authorized(request, env) {
  const token = env.MOCK_CONTROL_TOKEN ?? "";
  const header = request.headers.get("authorization") ?? "";
  if (token.length < 32 || header.length !== token.length + 7) return false;
  let diff = 0;
  const expected = `Bearer ${token}`;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ header.charCodeAt(i);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const state = env.MOCK_STATE.get(env.MOCK_STATE.idFromName("state"));

    if (request.method === "GET" && url.pathname === "/rest/v1/categories") {
      const overrides = await state.read("categories");
      return json(200, mockCategories(new Map(Object.entries(overrides))));
    }
    if (request.method === "GET" && url.pathname === "/rest/v1/site_settings") {
      await state.read("settings");
      return json(200, mockSettingsBody(request.headers.get("accept")));
    }

    if (url.pathname.startsWith("/__control/")) {
      if (!authorized(request, env)) return json(401, { error: "unauthorized" });
      if (request.method === "GET" && url.pathname === "/__control/stats") return json(200, await state.stats());
      if (request.method === "POST" && url.pathname === "/__control/reset") {
        await state.reset();
        return json(200, { reset: true });
      }
      if (request.method === "POST" && url.pathname === "/__control/price") {
        const body = await request.json().catch(() => ({}));
        if (!KNOWN_SLUGS.has(body.slug) || !Number.isInteger(body.price_min) || body.price_min < 0 || body.price_min > 10_000_000) {
          return json(400, { error: "invalid slug or price" });
        }
        await state.setPrice(body.slug, body.price_min);
        return json(200, { slug: body.slug, price_min: body.price_min });
      }
    }
    return json(404, { message: "not mocked" });
  },
};
