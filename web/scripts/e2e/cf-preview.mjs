// Cloudflare preview for Coffeella V2 (owner-approved: r2-d1-do, workers.dev URL only).
//
//   node scripts/e2e/cf-preview.mjs status     read-only: login + R2/D1 availability
//   node scripts/e2e/cf-preview.mjs rehearse   full run locally (wrangler dev), no account
//   node scripts/e2e/cf-preview.mjs deploy     create resources + deploy mock DB and preview
//   node scripts/e2e/cf-preview.mjs measure    CPU time, errors, price update on the preview
//   node scripts/e2e/cf-preview.mjs cleanup    delete everything this script created
//
// Safety:
// - Stops if Wrangler is not logged in or R2 is not enabled. Never enables
//   subscriptions, billing or paid plans.
// - Uses a mock menu database Worker; no Supabase project or production secrets.
// - Test secrets live in web/.dev.vars.preview (git-ignored) and are never printed.
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const webDir = resolve(here, "../..");
const previewDir = resolve(webDir, "cloudflare/preview");
const mockConfig = resolve(webDir, "cloudflare/mock-db/wrangler.jsonc");
const openNextConfig = resolve(previewDir, "open-next.config.ts");
const templateConfig = resolve(previewDir, "wrangler.template.jsonc");
const generatedConfig = resolve(previewDir, "wrangler.generated.jsonc");
const secretsFile = resolve(webDir, ".dev.vars.preview");
const resultsFile = resolve(previewDir, "last-measure.json");

const PREVIEW_WORKER = "coffeella-v2-preview";
const MOCK_WORKER = "coffeella-v2-mock-db";
const R2_BUCKET = "coffeella-v2-inc-cache";
const D1_NAME = "coffeella-v2-tag-cache";
const PRODUCT = "hot-coffee-and-hot-drinks-espresso";
const NEW_PRICE = 3111; // shows as "3,111", unique on the page
const ORIGINAL_PRICE = 3000;

// ---------------------------------------------------------------- helpers
function sh(command, { input, env = {}, allowFail = false } = {}) {
  const r = spawnSync(command, { cwd: webDir, shell: true, encoding: "utf8", input, env: { ...process.env, ...env } });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  if (r.status !== 0 && !allowFail) {
    console.error(out.slice(-2500));
    throw new Error(`command failed: ${command.split(" ").slice(0, 4).join(" ")} ...`);
  }
  return { ok: r.status === 0, out };
}

function readVars() {
  if (!existsSync(secretsFile)) return {};
  return Object.fromEntries(
    readFileSync(secretsFile, "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}
function writeVars(vars) {
  writeFileSync(secretsFile, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}
function ensureTestSecrets() {
  const vars = readVars();
  vars.REVALIDATE_SECRET ||= randomBytes(32).toString("hex");
  vars.MOCK_CONTROL_TOKEN ||= randomBytes(32).toString("hex");
  writeVars(vars);
  return vars;
}

function requireLogin() {
  const r = sh("npx wrangler whoami", { allowFail: true });
  if (!r.ok || /not authenticated/i.test(r.out)) {
    console.log("STOP: Wrangler is not logged in. Run `npx wrangler login` yourself (it opens your browser), then retry.");
    process.exit(3);
  }
}

function r2Status() {
  const r = sh("npx wrangler r2 bucket list", { allowFail: true });
  if (!r.ok) {
    const notEnabled = /enable R2|R2 subscription|purchase|10042/i.test(r.out);
    return { enabled: false, notEnabled, detail: r.out.split("\n").filter((l) => /error|R2/i.test(l)).slice(0, 3).join(" | ") };
  }
  return { enabled: true, buckets: [...r.out.matchAll(/name:\s+(\S+)/g)].map((m) => m[1]) };
}

// Streams `wrangler tail --format json` (pretty-printed JSON objects) into events.
function startTail(onEvent) {
  const child = spawn(`npx wrangler tail ${PREVIEW_WORKER} --format json`, { cwd: webDir, shell: true });
  let buf = "";
  let depth = 0;
  let inStr = false;
  let esc = false;
  let start = -1;
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let i = 0;
    for (; i < buf.length; i++) {
      const c = buf[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (c === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            onEvent(JSON.parse(buf.slice(start, i + 1)));
          } catch {
            /* ignore partial/non-event output */
          }
          buf = buf.slice(i + 1);
          i = -1;
          start = -1;
        }
      }
    }
  });
  let stderr = "";
  child.stderr.on("data", (d) => (stderr += d.toString()));
  return { child, stderr: () => stderr };
}

function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGTERM");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stats(values) {
  const v = values.filter((x) => typeof x === "number").sort((a, b) => a - b);
  if (!v.length) return null;
  const q = (p) => v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))];
  return { n: v.length, min: v[0], p50: q(0.5), p95: q(0.95), max: v[v.length - 1] };
}

// ---------------------------------------------------------------- scenario
async function scenario({ previewUrl, mockUrl, vars }) {
  const control = (path, body) =>
    fetch(mockUrl + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${vars.MOCK_CONTROL_TOKEN}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => r.json());

  const requests = [];
  const page = async (label, path = "/") => {
    const t = Date.now();
    const res = await fetch(previewUrl + path, { signal: AbortSignal.timeout(30_000) }).catch((e) => ({ status: 0, error: String(e) }));
    const html = res.text ? await res.text() : "";
    const rec = {
      label, path, status: res.status, ms: Date.now() - t,
      nextCache: res.headers?.get?.("x-nextjs-cache") ?? null,
      robots: res.headers?.get?.("x-robots-tag") ?? null,
      items: (html.match(/class="item"/g) ?? []).length,
      newPrice: html.includes("3,111"),
    };
    requests.push(rec);
    return rec;
  };
  const checks = [];
  const check = (name, ok, detail = {}) => {
    checks.push({ name, ok, ...detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${Object.keys(detail).length ? "  " + JSON.stringify(detail) : ""}`);
  };

  await control("/__control/reset", {});
  await control("/__control/price", { slug: PRODUCT, price_min: ORIGINAL_PRICE });

  const first = await page("warm-1");
  await page("warm-2");
  await page("warm-3");
  check("menu renders (82 items)", first.status === 200 && first.items === 82, { status: first.status, items: first.items });
  check("preview is marked noindex", (first.robots ?? "").includes("noindex"), { robots: first.robots });

  for (let i = 0; i < 30; i++) await page("hit");
  const hits = requests.filter((r) => r.label === "hit");
  check("30 cached requests all 200", hits.every((r) => r.status === 200), { statuses: [...new Set(hits.map((r) => r.status))] });

  const before = (await control("/__control/stats")).stats.categories;
  await control("/__control/price", { slug: PRODUCT, price_min: NEW_PRICE });
  const stale = [await page("after-db-change"), await page("after-db-change"), await page("after-db-change")];
  const readsDuringCache = (await control("/__control/stats")).stats.categories - before;
  check("after a DB change, cache still serves the published page", stale.every((r) => !r.newPrice), { dbReads: readsDuringCache });

  const wrong = await fetch(previewUrl + "/api/internal/revalidate", { method: "POST", headers: { authorization: "Bearer " + "x".repeat(64) } });
  check("revalidation with a wrong secret is rejected", wrong.status === 401, { status: wrong.status });

  const ok = await fetch(previewUrl + "/api/internal/revalidate", {
    method: "POST",
    headers: { authorization: `Bearer ${vars.REVALIDATE_SECRET}`, "content-type": "application/json" },
    body: JSON.stringify({ tags: ["menu"] }),
  });
  check("revalidation with the test secret succeeds", ok.status === 200, { status: ok.status });

  const fresh = await page("first-after-revalidate");
  const following = [];
  for (let i = 0; i < 10; i++) following.push(await page("after-revalidate"));
  check("first request after revalidation shows the new price", fresh.newPrice, { status: fresh.status, ms: fresh.ms });
  check("all following requests show the new price", following.every((r) => r.newPrice), {
    newPriceCount: following.filter((r) => r.newPrice).length,
  });

  const missing = await page("not-found", "/this-page-does-not-exist");
  check("unknown page returns 404", missing.status === 404, { status: missing.status });

  await control("/__control/price", { slug: PRODUCT, price_min: ORIGINAL_PRICE });
  return { requests, checks };
}

// ---------------------------------------------------------------- commands
async function status() {
  const who = sh("npx wrangler whoami", { allowFail: true });
  const loggedIn = who.ok && !/not authenticated/i.test(who.out);
  console.log(`Wrangler login: ${loggedIn ? "yes" : "NO (run `npx wrangler login`)"}`);
  if (!loggedIn) return;
  const r2 = r2Status();
  console.log(`R2: ${r2.enabled ? `enabled (buckets: ${r2.buckets.join(", ") || "none"})` : `NOT available — ${r2.notEnabled ? "R2 subscription required (enable it yourself in the dashboard; not done by this script)" : r2.detail}`}`);
  const d1 = sh("npx wrangler d1 list --json", { allowFail: true });
  console.log(`D1: ${d1.ok ? "available" : "error"}`);
}

async function deploy() {
  requireLogin();
  const r2 = r2Status();
  if (!r2.enabled) {
    console.log("STOP: R2 is not available on this account. Enabling R2 requires an R2 subscription (checkout flow).");
    console.log("Nothing was created. Ask the owner to decide (see web/README.md, Cloudflare section).");
    process.exit(4);
  }
  const vars = ensureTestSecrets();

  // D1 (tag cache)
  let d1Id = null;
  const list = sh("npx wrangler d1 list --json");
  try {
    d1Id = JSON.parse(list.out.slice(list.out.indexOf("["))).find((d) => d.name === D1_NAME)?.uuid ?? null;
  } catch {
    d1Id = null;
  }
  if (!d1Id) {
    const created = sh(`npx wrangler d1 create ${D1_NAME}`);
    d1Id = created.out.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
    if (!d1Id) throw new Error("could not read the D1 database id");
    console.log(`created D1 database ${D1_NAME}`);
  }

  // R2 (incremental cache)
  if (!r2.buckets.includes(R2_BUCKET)) {
    sh(`npx wrangler r2 bucket create ${R2_BUCKET}`);
    console.log(`created R2 bucket ${R2_BUCKET}`);
  }

  writeFileSync(generatedConfig, readFileSync(templateConfig, "utf8").replace("__D1_DATABASE_ID__", d1Id));

  // Mock database Worker
  const mockDeploy = sh(`npx wrangler deploy -c "${mockConfig}"`);
  const mockUrl = mockDeploy.out.match(/https:\/\/coffeella-v2-mock-db\.[a-z0-9-]+\.workers\.dev/)?.[0];
  if (!mockUrl) throw new Error("could not read the mock Worker URL (is a workers.dev subdomain registered?)");
  sh(`npx wrangler secret put MOCK_CONTROL_TOKEN -c "${mockConfig}"`, { input: vars.MOCK_CONTROL_TOKEN });

  // Preview Worker (build against the mock database, preview flag => noindex)
  const buildEnv = {
    NEXT_PUBLIC_SUPABASE_URL: mockUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-mock-not-a-secret",
    NEXT_PUBLIC_DEPLOY_ENV: "preview",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  sh(`npx opennextjs-cloudflare build --openNextConfigPath "${openNextConfig}" -c "${generatedConfig}"`, { env: buildEnv });
  const previewDeploy = sh(`npx opennextjs-cloudflare deploy -c "${generatedConfig}"`, { env: buildEnv });
  const previewUrl = previewDeploy.out.match(/https:\/\/coffeella-v2-preview\.[a-z0-9-]+\.workers\.dev/)?.[0];
  if (!previewUrl) throw new Error("could not read the preview URL");
  sh(`npx wrangler secret put REVALIDATE_SECRET -c "${generatedConfig}"`, { input: vars.REVALIDATE_SECRET });

  writeVars({ ...vars, PREVIEW_URL: previewUrl, MOCK_URL: mockUrl });
  console.log(`deployed preview: ${previewUrl}`);
  console.log(`deployed mock DB: ${mockUrl}`);
}

async function measure() {
  requireLogin();
  const vars = readVars();
  if (!vars.PREVIEW_URL || !vars.MOCK_URL) throw new Error("run deploy first");
  const events = [];
  const tail = startTail((e) => events.push(e));
  await sleep(12_000); // let the tail session connect
  const run = await scenario({ previewUrl: vars.PREVIEW_URL, mockUrl: vars.MOCK_URL, vars });
  await sleep(15_000); // let trailing events arrive
  killTree(tail.child);

  const ours = events.filter((e) => String(e?.event?.request?.url ?? "").startsWith(vars.PREVIEW_URL));
  const cpu = (filter) => stats(ours.filter(filter).map((e) => e.cpuTime));
  const wall = (filter) => stats(ours.filter(filter).map((e) => e.wallTime));
  const isPage = (e) => new URL(e.event.request.url).pathname === "/";
  const summary = {
    at: new Date().toISOString(),
    tailEvents: ours.length,
    cpuTimeFieldPresent: ours.some((e) => typeof e.cpuTime === "number"),
    outcomes: ours.reduce((m, e) => ((m[e.outcome] = (m[e.outcome] ?? 0) + 1), m), {}),
    exceptions: ours.flatMap((e) => (e.exceptions ?? []).map((x) => `${x.name}: ${x.message}`)).slice(0, 10),
    httpErrors: run.requests.filter((r) => r.status >= 500 || r.status === 0).map((r) => ({ label: r.label, status: r.status })),
    cpuMs: { page: cpu(isPage), all: cpu(() => true) },
    wallMs: { page: wall(isPage), all: wall(() => true) },
    responseMs: stats(run.requests.filter((r) => r.path === "/").map((r) => r.ms)),
    checks: run.checks,
  };
  writeFileSync(resultsFile, JSON.stringify({ summary, requests: run.requests, events: ours }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

async function cleanup() {
  requireLogin();
  for (const name of [PREVIEW_WORKER, MOCK_WORKER]) {
    const r = sh(`npx wrangler delete ${name}`, { input: "y\n", allowFail: true });
    console.log(`delete Worker ${name}: ${r.ok ? "done" : "not found or failed"}`);
  }
  const d1 = sh(`npx wrangler d1 delete ${D1_NAME} -y`, { allowFail: true });
  console.log(`delete D1 ${D1_NAME}: ${d1.ok ? "done" : "not found or failed"}`);
  const r2 = r2Status();
  if (r2.enabled && r2.buckets.includes(R2_BUCKET)) {
    const del = sh(`npx wrangler r2 bucket delete ${R2_BUCKET}`, { allowFail: true });
    if (del.ok) console.log(`delete R2 bucket ${R2_BUCKET}: done`);
    else {
      sh(`npx wrangler r2 bucket lifecycle add ${R2_BUCKET} expire-all --expire-days 1 -y`, { allowFail: true });
      console.log(`R2 bucket ${R2_BUCKET} is not empty: added a rule expiring all objects after 1 day. Re-run cleanup after that (or empty it in the dashboard).`);
    }
  }
  rmSync(generatedConfig, { force: true });
  rmSync(secretsFile, { force: true });
  console.log("local preview files removed (.dev.vars.preview, wrangler.generated.jsonc)");
}

// Local rehearsal of the whole flow (no account): mock Worker + preview Worker in wrangler dev.
async function rehearse() {
  const vars = { REVALIDATE_SECRET: randomBytes(32).toString("hex"), MOCK_CONTROL_TOKEN: randomBytes(32).toString("hex") };
  const MOCK_PORT = 8801;
  const PREVIEW_PORT = 8802;
  const mockUrl = `http://127.0.0.1:${MOCK_PORT}`;
  const previewUrl = `http://127.0.0.1:${PREVIEW_PORT}`;
  const localConfig = resolve(previewDir, "wrangler.rehearse.jsonc");
  writeFileSync(localConfig, readFileSync(templateConfig, "utf8").replace("__D1_DATABASE_ID__", "00000000-0000-0000-0000-000000000000"));
  for (const dir of [resolve(previewDir, ".wrangler"), resolve(webDir, "cloudflare/mock-db/.wrangler"), resolve(webDir, ".wrangler")]) rmSync(dir, { recursive: true, force: true });

  const children = [];
  const startDev = async (config, port, extra = "") => {
    let log = "";
    const child = spawn(`npx wrangler dev -c "${config}" --port ${port} --ip 127.0.0.1 ${extra}`, { cwd: webDir, shell: true });
    child.stdout.on("data", (d) => (log += d));
    child.stderr.on("data", (d) => (log += d));
    children.push(child);
    for (let i = 0; i < 120 && !log.includes(`Ready on http://127.0.0.1:${port}`); i++) await sleep(1000);
    return () => log;
  };
  try {
    await startDev(mockConfig, MOCK_PORT, `--var MOCK_CONTROL_TOKEN:${vars.MOCK_CONTROL_TOKEN} --inspector-port 9331`);
    const buildEnv = {
      NEXT_PUBLIC_SUPABASE_URL: mockUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "preview-mock-not-a-secret",
      NEXT_PUBLIC_DEPLOY_ENV: "preview",
      NEXT_TELEMETRY_DISABLED: "1",
    };
    sh(`npx opennextjs-cloudflare build --openNextConfigPath "${openNextConfig}" -c "${localConfig}"`, { env: buildEnv });
    sh(`npx opennextjs-cloudflare populateCache local -c "${localConfig}"`, { env: buildEnv });
    const previewLog = await startDev(localConfig, PREVIEW_PORT, `--var REVALIDATE_SECRET:${vars.REVALIDATE_SECRET} --inspector-port 9332`);
    const run = await scenario({ previewUrl, mockUrl, vars });
    const errors = [...new Set((previewLog().replace(/\x1b\[[0-9;]*m/g, "").match(/^.*(ERROR|Uncaught|hung).*$/gm) ?? []).map((l) => l.trim()))];
    console.log(errors.length ? `worker log errors: ${JSON.stringify(errors.slice(0, 5))}` : "worker log: no errors");
    const passed = run.checks.every((c) => c.ok) && errors.length === 0;
    console.log(`\nREHEARSAL: ${passed ? "PASS" : "FAIL"} (${run.checks.filter((c) => c.ok).length}/${run.checks.length} checks)`);
    process.exitCode = passed ? 0 : 1;
  } finally {
    children.forEach(killTree);
    rmSync(localConfig, { force: true });
  }
}

const commands = { status, deploy, measure, cleanup, rehearse };
const cmd = process.argv[2];
if (!commands[cmd]) {
  console.error("usage: node scripts/e2e/cf-preview.mjs <status|rehearse|deploy|measure|cleanup>");
  process.exit(2);
}
await commands[cmd]();
