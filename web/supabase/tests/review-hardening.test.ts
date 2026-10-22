import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { anon, as, createTestDb, createUser, productId, scalar, setRole, user } from "./db-helpers";

let db: PGlite;
let owner: string;
let admin: string;
let moderator: string;
let alice: string;
let latte: string;

const DENIED = /row-level security|permission denied/;

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, { email: "owner@example.test" });
  admin = await createUser(db, { email: "admin@example.test" });
  moderator = await createUser(db, { email: "mod@example.test" });
  alice = await createUser(db, { email: "alice@example.test", name: "Alice" });
  await scalar(db, `select public.bootstrap_owner('owner@example.test')`);
  await setRole(db, admin, "admin");
  await setRole(db, moderator, "moderator");
  latte = await productId(db, "hot-coffee-and-hot-drinks-latte");
}, 60_000);

describe("review hardening", () => {
  it("tables and functions created later are not exposed automatically", async () => {
    await db.exec(`create table public.later_table (id int primary key); insert into public.later_table values (1);`);
    await db.exec(`create function public.later_fn() returns int language sql as 'select 1';`);
    await expect(as(db, anon, (tx) => tx.query(`select * from public.later_table`))).rejects.toThrow(DENIED);
    await expect(as(db, user(alice), (tx) => tx.query(`select * from public.later_table`))).rejects.toThrow(DENIED);
    await expect(as(db, anon, (tx) => tx.query(`select public.later_fn()`))).rejects.toThrow(DENIED);
    await expect(as(db, user(alice), (tx) => tx.query(`select public.later_fn()`))).rejects.toThrow(DENIED);
  });

  it("cannot favorite a hidden product", async () => {
    await db.query(`update public.products set is_visible = false where id = $1`, [latte]);
    await expect(as(db, user(alice), (tx) => tx.query(`insert into public.favorites (product_id) values ($1)`, [latte]))).rejects.toThrow(DENIED);
    await db.query(`update public.products set is_visible = true where id = $1`, [latte]);
    await as(db, user(alice), (tx) => tx.query(`insert into public.favorites (product_id) values ($1)`, [latte]));
    expect(await scalar<number>(db, `select count(*)::int from public.favorites where user_id = $1`, [alice])).toBe(1);
  });

  it("banned users cannot change their display name", async () => {
    await db.query(`update public.profiles set is_banned = true where id = $1`, [alice]);
    await as(db, user(alice), (tx) => tx.query(`update public.profiles set display_name = 'Changed' where id = $1`, [alice]));
    expect(await scalar<string>(db, `select display_name from public.profiles where id = $1`, [alice])).toBe("Alice");
    await db.query(`update public.profiles set is_banned = false where id = $1`, [alice]);
  });

  it("public settings values are size-limited", async () => {
    const big = JSON.stringify({ blob: "x".repeat(40_000) });
    await expect(as(db, user(admin), (tx) => tx.query(`update public.site_settings set value = $1::jsonb where key = 'theme'`, [big]))).rejects.toThrow(/site_settings_value_size/);
  });

  it("only owner/admin see e-mail addresses in the user list", async () => {
    const asMod = await as(db, user(moderator), (tx) => tx.query<{ email: string | null }>(`select email from public.admin_list_users()`));
    expect(asMod.rows.length).toBeGreaterThanOrEqual(4);
    expect(asMod.rows.every((r) => r.email === null)).toBe(true);
    const byEmail = await as(db, user(moderator), (tx) => tx.query(`select * from public.admin_list_users('alice@')`));
    expect(byEmail.rows).toHaveLength(0);
    const asAdmin = await as(db, user(admin), (tx) => tx.query<{ email: string | null }>(`select email from public.admin_list_users()`));
    expect(asAdmin.rows.map((r) => r.email)).toContain("alice@example.test");
  });

  it("ownership transfer requires a sign-in within the last 10 minutes", async () => {
    await expect(
      as(db, user(owner, 3600), (tx) => tx.query(`select public.request_ownership_transfer($1)`, [admin])),
    ).rejects.toThrow(/sign in again/);
    const id = await as(db, user(owner, 30), (tx) => scalar<string>(tx, `select public.request_ownership_transfer($1)`, [admin]));
    await expect(
      as(db, user(admin, 3600), (tx) => tx.query(`select public.accept_ownership_transfer($1)`, [id])),
    ).rejects.toThrow(/sign in again/);
    expect(await scalar<string>(db, `select status from public.ownership_transfers where id = $1`, [id])).toBe("pending");
    expect(await as(db, user(admin, 30), (tx) => scalar<string>(tx, `select public.accept_ownership_transfer($1)`, [id]))).toBe("accepted");
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [admin])).toBe("owner");
  });

  it("the recent-sign-in helper is not callable from the API", async () => {
    await expect(as(db, user(alice), (tx) => tx.query(`select public.recently_authenticated(600)`))).rejects.toThrow(DENIED);
  });
});
