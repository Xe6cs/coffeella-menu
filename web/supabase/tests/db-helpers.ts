import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const supabaseDir = resolve(__dirname, "..");

function read(path: string) {
  return readFileSync(path, "utf8");
}

export const migrationFiles = readdirSync(join(supabaseDir, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

/** Fresh in-memory Postgres with the Supabase shim, all migrations and the seed. */
export async function createTestDb({ seed = true } = {}) {
  const db = new PGlite();
  await db.exec(read(join(supabaseDir, "tests", "supabase-shim.sql")));
  for (const file of migrationFiles) {
    await db.exec(read(join(supabaseDir, "migrations", file)));
  }
  if (seed) await db.exec(read(join(supabaseDir, "seed.sql")));
  return db;
}

export async function runSeed(db: PGlite) {
  await db.exec(read(join(supabaseDir, "seed.sql")));
}

let counter = 0;

/** Inserts an auth user (the trigger creates the profile). Runs as superuser. */
export async function createUser(
  db: PGlite,
  opts: { email?: string; confirmed?: boolean; name?: string } = {},
): Promise<string> {
  counter += 1;
  const email = opts.email ?? `user${counter}@example.test`;
  const res = await db.query<{ id: string }>(
    `insert into auth.users (email, email_confirmed_at, raw_user_meta_data)
     values ($1, $2, $3) returning id`,
    [
      email,
      opts.confirmed === false ? null : new Date().toISOString(),
      JSON.stringify({ full_name: opts.name ?? `Test User ${counter}` }),
    ],
  );
  return res.rows[0].id;
}

/** Superuser shortcut used only to arrange test fixtures. */
export async function setRole(db: PGlite, userId: string, role: "owner" | "admin" | "editor" | "moderator") {
  await db.query(
    `insert into public.staff_roles (user_id, role) values ($1, $2)
     on conflict (user_id) do update set role = excluded.role`,
    [userId, role],
  );
}

export type Who = { role: "anon" } | { role: "authenticated"; id: string };
export const anon: Who = { role: "anon" };
export const user = (id: string): Who => ({ role: "authenticated", id });

/**
 * Runs fn inside a transaction as an API role with the given JWT claims,
 * exactly like PostgREST does for a Supabase request.
 */
export async function as<T>(db: PGlite, who: Who, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${who.role}`);
    const claims = who.role === "anon" ? { role: "anon" } : { sub: who.id, role: "authenticated" };
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    return fn(tx);
  });
}

export async function scalar<T = unknown>(tx: Transaction | PGlite, sql: string, params: unknown[] = []): Promise<T> {
  const res = await tx.query<Record<string, T>>(sql, params);
  const first = res.rows[0];
  return first ? (Object.values(first)[0] as T) : (undefined as T);
}

export async function productId(db: PGlite, slug: string): Promise<string> {
  return scalar<string>(db, `select id from public.products where slug = $1`, [slug]);
}
