// Minimal stand-in for the two Supabase REST (PostgREST) endpoints the public
// site reads, so cache/revalidation behaviour can be tested locally without a
// real project. Prices can be changed at runtime to simulate a publish.
import http from "node:http";
import { mockCategories, mockSettingsBody } from "./mock-data.mjs";

export function startMockSupabase(port) {
  const priceOverrides = new Map();
  const stats = { categories: 0, settings: 0 };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const json = (status, body) => {
      res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    if (req.method === "GET" && url.pathname === "/rest/v1/categories") {
      stats.categories += 1;
      return json(200, mockCategories(priceOverrides));
    }
    if (req.method === "GET" && url.pathname === "/rest/v1/site_settings") {
      stats.settings += 1;
      return json(200, mockSettingsBody(req.headers.accept));
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
