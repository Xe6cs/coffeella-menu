// Minimal stand-in for the two Supabase REST (PostgREST) endpoints the public
// site reads, so cache/revalidation behaviour can be tested locally without a
// real project. Data comes from data/menu.v1.snapshot.json; prices can be
// changed at runtime to simulate an admin publishing a change.
import { readFileSync } from "node:fs";
import http from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const snapshot = JSON.parse(readFileSync(resolve(here, "../../data/menu.v1.snapshot.json"), "utf8"));

const CONTACT = {
  address_ar: "بغداد – حي الجامعة – فرع شركة كري الأرض الصلبة",
  phone_display: "0787 001 0580",
  phone_e164: "+9647870010580",
  whatsapp_url: "https://wa.me/9647870010580",
  instagram_url: "https://www.instagram.com/coffeella.cafe",
  instagram_handle: "@coffeella.cafe",
};

export function startMockSupabase(port) {
  const priceOverrides = new Map();
  const stats = { categories: 0, settings: 0 };

  const categories = () =>
    snapshot.categories.map((c) => ({
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

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/rest/v1/categories") {
      stats.categories += 1;
      return json(200, categories());
    }
    if (req.method === "GET" && url.pathname === "/rest/v1/site_settings") {
      stats.settings += 1;
      const row = { value: CONTACT };
      return json(200, String(req.headers.accept ?? "").includes("vnd.pgrst.object") ? row : [row]);
    }
    return json(404, { message: "not mocked", path: url.pathname });
  });

  return new Promise((resolveStart) => {
    server.listen(port, "127.0.0.1", () =>
      resolveStart({
        url: `http://127.0.0.1:${port}`,
        stats,
        setPrice: (slug, price) => priceOverrides.set(slug, price),
        close: () => new Promise((r) => server.close(r)),
      }),
    );
  });
}
