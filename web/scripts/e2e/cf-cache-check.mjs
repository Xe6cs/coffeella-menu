// End-to-end cache check in the local Cloudflare runtime (workerd), no account needed.
//
//   node scripts/e2e/cf-cache-check.mjs <variant>     (variants: "main" or a folder in cloudflare/variants/)
//
// 1. Starts a mock Supabase REST server.
// 2. Builds the app with OpenNext using the variant's configs, populates the local cache.
// 3. Runs `wrangler dev` and checks:
//    - the page is served from cache (no new DB reads) after a price change,
//    - the revalidation endpoint rejects a wrong secret,
//    - after revalidation the very next request shows the new price.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startMockSupabase } from "./mock-supabase.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const variant = process.argv[2];
// "main" = the app's real config (web/open-next.config.ts + web/wrangler.jsonc).
const variantDir = variant === "main" ? webDir : resolve(webDir, "cloudflare/variants", variant ?? "");
if (!variant || !existsSync(variantDir)) {
  console.error("usage: node scripts/e2e/cf-cache-check.mjs <variant>");
  process.exit(2);
}
const openNextConfig = resolve(variantDir, "open-next.config.ts");
const wranglerConfig = resolve(variantDir, "wrangler.jsonc");
const MOCK_PORT = 54399;
const WORKER_PORT = 8791;
const SECRET = randomBytes(24).toString("hex");
const PRODUCT = "hot-coffee-and-hot-drinks-espresso";
const NEW_PRICE = 3111; // renders as "3,111", unique on the page
const isWin = process.platform === "win32";

const run = (args, env = {}) => {
  // One command string (all parts are internal constants/paths without spaces).
  const r = spawnSync(["npx", ...args].join(" "), { cwd: webDir, env: { ...process.env, ...env }, shell: true, encoding: "utf8" });
  if (r.status !== 0) {
    console.error((r.stdout ?? "").slice(-3000), (r.stderr ?? "").slice(-3000));
    throw new Error(`failed: npx ${args.join(" ")}`);
  }
  return r.stdout;
};

const results = { variant, steps: [] };
const step = (name, ok, detail = {}) => {
  results.steps.push({ name, ok, ...detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${Object.keys(detail).length ? "  " + JSON.stringify(detail) : ""}`);
};

const mock = await startMockSupabase(MOCK_PORT);
const buildEnv = {
  NEXT_PUBLIC_SUPABASE_URL: mock.url,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-local-publishable-key",
  NEXT_TELEMETRY_DISABLED: "1",
};
let worker;
try {
  console.log(`== build (${variant}) ==`);
  run(["opennextjs-cloudflare", "build", "--openNextConfigPath", openNextConfig, "-c", wranglerConfig], buildEnv);
  // Start from an empty local cache so earlier runs cannot affect the result.
  for (const dir of [resolve(variantDir, ".wrangler"), resolve(webDir, ".wrangler")]) rmSync(dir, { recursive: true, force: true });
  run(["opennextjs-cloudflare", "populateCache", "local", "-c", wranglerConfig], buildEnv);
  const readsAfterBuild = mock.stats.categories;

  console.log("== start worker ==");
  worker = spawn(
    ["npx", "wrangler", "dev", "-c", wranglerConfig, "--port", String(WORKER_PORT), "--ip", "127.0.0.1", "--var", `REVALIDATE_SECRET:${SECRET}`].join(" "),
    { cwd: webDir, shell: true, env: { ...process.env, ...buildEnv } },
  );
  let log = "";
  worker.stdout.on("data", (d) => (log += d));
  worker.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120 && !log.includes(`Ready on http://127.0.0.1:${WORKER_PORT}`); i++) await new Promise((r) => setTimeout(r, 1000));

  const base = `http://127.0.0.1:${WORKER_PORT}`;
  const page = async () => {
    const t = Date.now();
    const res = await fetch(base + "/", { signal: AbortSignal.timeout(30_000) });
    const html = await res.text();
    return { status: res.status, ms: Date.now() - t, items: (html.match(/class="item"/g) ?? []).length, hasNewPrice: html.includes("3,111") };
  };

  const first = await page();
  step("initial page renders the menu", first.status === 200 && first.items === 82, { status: first.status, items: first.items, ms: first.ms });

  mock.setPrice(PRODUCT, NEW_PRICE);
  const readsBefore = mock.stats.categories;
  const cached1 = await page();
  const cached2 = await page();
  step("after a DB change the page is still served from cache", !cached1.hasNewPrice && !cached2.hasNewPrice, {
    newDbReads: mock.stats.categories - readsBefore,
    ms: [cached1.ms, cached2.ms],
  });

  const wrong = await fetch(base + "/api/internal/revalidate", { method: "POST", headers: { authorization: "Bearer wrong-secret-wrong-secret-wrong-secret" } });
  const afterWrong = await page();
  step("revalidation with a wrong secret is rejected", wrong.status === 401 && !afterWrong.hasNewPrice, { status: wrong.status });

  const ok = await fetch(base + "/api/internal/revalidate", {
    method: "POST",
    headers: { authorization: `Bearer ${SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ tags: ["menu"] }),
  });
  const okBody = await ok.json().catch(() => ({}));
  step("revalidation with the secret succeeds", ok.status === 200, { status: ok.status, body: okBody });

  const fresh1 = await page();
  const fresh2 = await page();
  step("the next request after revalidation shows the new price", fresh1.hasNewPrice, {
    firstRequest: fresh1.hasNewPrice, secondRequest: fresh2.hasNewPrice, ms: [fresh1.ms, fresh2.ms],
  });

  const readsBeforeRepeat = mock.stats.categories;
  await page();
  step("fresh page is cached again (no extra DB reads)", mock.stats.categories === readsBeforeRepeat, {
    extraReads: mock.stats.categories - readsBeforeRepeat,
  });

  const errors = [...new Set((log.replace(/\x1b\[[0-9;]*m/g, "").match(/^.*(ERROR|Uncaught|hung).*$/gm) ?? []).map((l) => l.trim()))];
  step("no runtime errors in the worker log", errors.length === 0, errors.length ? { errors: errors.slice(0, 5) } : {});
  results.dbReads = { duringBuild: readsAfterBuild, total: mock.stats.categories };
} catch (e) {
  step("script error", false, { message: String(e.message ?? e) });
} finally {
  if (worker?.pid) {
    if (isWin) spawnSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], { stdio: "ignore" });
    else worker.kill("SIGTERM");
  }
  await mock.close();
}

const passed = results.steps.every((s) => s.ok);
console.log(`\nRESULT ${variant}: ${passed ? "PASS" : "FAIL"} (${results.steps.filter((s) => s.ok).length}/${results.steps.length})`);
process.exit(passed ? 0 : 1);
