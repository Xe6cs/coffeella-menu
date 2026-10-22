import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import snapshot from "../../data/menu.v1.snapshot.json";
import { anon, as, createTestDb, createUser, productId, runSeed, scalar, setRole, user } from "./db-helpers";

let db: PGlite;
let owner: string;
let admin: string;
let editor: string;
let moderator: string;
let alice: string;
let bob: string;
let banned: string;
let latte: string;
let espresso: string;

const RLS = /row-level security|permission denied/;

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, { email: "owner@example.test", name: "Owner Person" });
  admin = await createUser(db, { email: "admin@example.test" });
  editor = await createUser(db, { email: "editor@example.test" });
  moderator = await createUser(db, { email: "mod@example.test" });
  alice = await createUser(db, { email: "alice@example.test", name: "Alice Smith" });
  bob = await createUser(db, { email: "bob@example.test" });
  banned = await createUser(db, { email: "banned@example.test" });
  await scalar(db, `select public.bootstrap_owner('owner@example.test')`);
  await setRole(db, admin, "admin");
  await setRole(db, editor, "editor");
  await setRole(db, moderator, "moderator");
  await db.query(`update public.profiles set is_banned = true where id = $1`, [banned]);
  latte = await productId(db, "hot-coffee-and-hot-drinks-latte");
  espresso = await productId(db, "hot-coffee-and-hot-drinks-espresso");
}, 60_000);

describe("seed / menu import", () => {
  it("imports exactly the v1 counts", async () => {
    expect(await scalar<number>(db, `select count(*)::int from public.categories`)).toBe(snapshot.counts.categories);
    expect(await scalar<number>(db, `select count(*)::int from public.product_groups`)).toBe(snapshot.counts.groups);
    expect(await scalar<number>(db, `select count(*)::int from public.products`)).toBe(snapshot.counts.products);
  });

  it("matches every name, price and order from the snapshot", async () => {
    const rows = await db.query<{
      cat: string; group_slug: string; slug: string; name_ar: string; name_en: string | null;
      price_min: number; price_max: number | null; sort_order: number;
    }>(`select c.slug as cat, g.slug as group_slug, p.slug, p.name_ar, p.name_en, p.price_min, p.price_max, p.sort_order
        from public.products p join public.product_groups g on g.id = p.group_id
        join public.categories c on c.id = g.category_id
        order by c.sort_order, g.sort_order, p.sort_order`);
    const expected = snapshot.categories.flatMap((c) =>
      c.groups.flatMap((g) =>
        g.products.map((p) => ({
          cat: c.slug, group_slug: g.slug, slug: p.slug, name_ar: p.name_ar, name_en: p.name_en,
          price_min: p.price_min, price_max: p.price_max, sort_order: p.sort_order,
        })),
      ),
    );
    expect(rows.rows).toEqual(expected);
  });

  it("is idempotent: running the seed again adds nothing", async () => {
    await runSeed(db);
    await runSeed(db);
    expect(await scalar<number>(db, `select count(*)::int from public.products`)).toBe(82);
    expect(await scalar<number>(db, `select count(distinct slug)::int from public.products`)).toBe(82);
  });

  it("does not overwrite admin edits when re-run", async () => {
    await db.query(`update public.products set price_min = 9999 where id = $1`, [espresso]);
    await runSeed(db);
    expect(await scalar<number>(db, `select price_min from public.products where id = $1`, [espresso])).toBe(9999);
    await db.query(`update public.products set price_min = 3000 where id = $1`, [espresso]);
  });
});

describe("visitors (anon)", () => {
  it("can read the visible menu", async () => {
    const n = await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.products`));
    expect(n).toBe(82);
  });

  it("cannot see hidden products or products of hidden groups", async () => {
    await db.query(`update public.products set is_visible = false where id = $1`, [latte]);
    const visible = await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.products`));
    expect(visible).toBe(81);
    await db.query(`update public.products set is_visible = true where id = $1`, [latte]);

    await db.query(`update public.product_groups set is_visible = false where slug = 'cold-frappe'`);
    const withHiddenGroup = await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.products`));
    expect(withHiddenGroup).toBe(78);
    await db.query(`update public.product_groups set is_visible = true where slug = 'cold-frappe'`);
  });

  it("cannot change the menu", async () => {
    await expect(as(db, anon, (tx) => tx.query(`update public.products set price_min = 1 where id = $1`, [latte]))).rejects.toThrow(RLS);
    await expect(as(db, anon, (tx) => tx.query(`delete from public.products`))).rejects.toThrow(RLS);
  });

  it("cannot read private tables", async () => {
    for (const table of ["profiles", "favorites", "staff_roles", "audit_log", "ownership_transfers", "media_assets", "upload_rules"]) {
      await expect(as(db, anon, (tx) => tx.query(`select * from public.${table}`)), table).rejects.toThrow(RLS);
    }
  });

  it("cannot read reviewer ids", async () => {
    await expect(as(db, anon, (tx) => tx.query(`select user_id from public.reviews`))).rejects.toThrow(RLS);
  });

  it("cannot call admin functions", async () => {
    await expect(as(db, anon, (tx) => tx.query(`select public.admin_set_ban($1, true, null)`, [alice]))).rejects.toThrow(RLS);
    await expect(as(db, anon, (tx) => tx.query(`select * from public.admin_list_users()`))).rejects.toThrow(RLS);
    await expect(as(db, anon, (tx) => tx.query(`select public.bootstrap_owner('alice@example.test')`))).rejects.toThrow(RLS);
  });

  it("can read public settings", async () => {
    const phone = await as(db, anon, (tx) => scalar<string>(tx, `select value->>'phone_display' from public.site_settings where key = 'contact'`));
    expect(phone).toBe("0787 001 0580");
  });
});

describe("customers: favorites", () => {
  it("adds, lists and removes own favorites", async () => {
    await as(db, user(alice), (tx) => tx.query(`insert into public.favorites (product_id) values ($1)`, [latte]));
    const mine = await as(db, user(alice), (tx) => scalar<number>(tx, `select count(*)::int from public.favorites`));
    expect(mine).toBe(1);
    // Persisted across "sessions": a new transaction still sees it.
    expect(await as(db, user(alice), (tx) => scalar<string>(tx, `select product_id from public.favorites`))).toBe(latte);
    await as(db, user(alice), (tx) => tx.query(`delete from public.favorites where product_id = $1`, [latte]));
    expect(await as(db, user(alice), (tx) => scalar<number>(tx, `select count(*)::int from public.favorites`))).toBe(0);
  });

  it("cannot read or write someone else's favorites", async () => {
    await as(db, user(bob), (tx) => tx.query(`insert into public.favorites (product_id) values ($1)`, [latte]));
    expect(await as(db, user(alice), (tx) => scalar<number>(tx, `select count(*)::int from public.favorites`))).toBe(0);
    await expect(
      as(db, user(alice), (tx) => tx.query(`insert into public.favorites (user_id, product_id) values ($1, $2)`, [bob, espresso])),
    ).rejects.toThrow(RLS);
    await as(db, user(alice), (tx) => tx.query(`delete from public.favorites where user_id = $1`, [bob]));
    expect(await scalar<number>(db, `select count(*)::int from public.favorites where user_id = $1`, [bob])).toBe(1);
  });

  it("banned users cannot add favorites", async () => {
    await expect(as(db, user(banned), (tx) => tx.query(`insert into public.favorites (product_id) values ($1)`, [latte]))).rejects.toThrow(RLS);
  });
});

describe("customers: reviews", () => {
  it("one review per customer per product (database constraint)", async () => {
    await as(db, user(alice), (tx) => tx.query(`insert into public.reviews (product_id, rating, comment) values ($1, 5, 'رائع')`, [latte]));
    await expect(
      as(db, user(alice), (tx) => tx.query(`insert into public.reviews (product_id, rating) values ($1, 3)`, [latte])),
    ).rejects.toThrow(/reviews_one_per_user_per_product|duplicate key/);
  });

  it("rejects ratings outside 1–5 and empty comments", async () => {
    await expect(as(db, user(bob), (tx) => tx.query(`insert into public.reviews (product_id, rating) values ($1, 6)`, [espresso]))).rejects.toThrow(/check/);
    await expect(as(db, user(bob), (tx) => tx.query(`insert into public.reviews (product_id, rating) values ($1, 0)`, [espresso]))).rejects.toThrow(/check/);
    await expect(as(db, user(bob), (tx) => tx.query(`insert into public.reviews (product_id, rating, comment) values ($1, 4, '   ')`, [espresso]))).rejects.toThrow(/check/);
  });

  it("customers edit only their own review, and only rating/comment", async () => {
    await as(db, user(alice), (tx) => tx.query(`update public.reviews set rating = 4, comment = 'جيد جداً' where product_id = $1`, [latte]));
    expect(await scalar<number>(db, `select rating from public.reviews where user_id = $1 and product_id = $2`, [alice, latte])).toBe(4);

    await as(db, user(bob), (tx) => tx.query(`insert into public.reviews (product_id, rating) values ($1, 2)`, [latte]));
    await as(db, user(alice), (tx) => tx.query(`update public.reviews set rating = 5 where user_id = $1`, [bob]));
    expect(await scalar<number>(db, `select rating from public.reviews where user_id = $1 and product_id = $2`, [bob, latte])).toBe(2);

    await expect(as(db, user(alice), (tx) => tx.query(`update public.reviews set is_hidden = false where user_id = $1`, [alice]))).rejects.toThrow(RLS);
    await expect(as(db, user(alice), (tx) => tx.query(`update public.reviews set user_id = $1 where user_id = $2`, [bob, alice]))).rejects.toThrow(RLS);
    await expect(as(db, user(alice), (tx) => tx.query(`insert into public.reviews (product_id, rating, is_hidden) values ($1, 5, false)`, [espresso]))).rejects.toThrow(RLS);
  });

  it("computes the average and count over visible reviews", async () => {
    const s = await as(db, anon, (tx) =>
      tx.query<{ average_rating: string; rating_count: number }>(
        `select average_rating, rating_count from public.product_rating_summary where product_id = $1`, [latte]),
    );
    expect(s.rows[0]).toEqual({ average_rating: "3.00", rating_count: 2 });
  });

  it("banned users cannot review", async () => {
    await expect(as(db, user(banned), (tx) => tx.query(`insert into public.reviews (product_id, rating) values ($1, 5)`, [espresso]))).rejects.toThrow(RLS);
  });

  it("public review list exposes first name only, never ids or emails", async () => {
    const res = await as(db, anon, (tx) => tx.query<Record<string, unknown>>(`select * from public.get_product_reviews($1)`, [latte]));
    expect(res.rows).toHaveLength(2);
    expect(Object.keys(res.rows[0]).sort()).toEqual(["author_name", "comment", "created_at", "id", "rating", "updated_at"]);
    expect(res.rows.map((r) => r.author_name)).toContain("Alice");
    expect(JSON.stringify(res.rows)).not.toContain("@example.test");
  });
});

describe("moderation", () => {
  it("moderators hide reviews; hidden reviews leave the public list and the average", async () => {
    const bobReview = await scalar<string>(db, `select id from public.reviews where user_id = $1 and product_id = $2`, [bob, latte]);
    await expect(as(db, user(editor), (tx) => tx.query(`select public.moderate_review($1, true, 'x')`, [bobReview]))).rejects.toThrow(/permission denied/);
    await as(db, user(moderator), (tx) => tx.query(`select public.moderate_review($1, true, 'spam')`, [bobReview]));

    const publicCount = await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.get_product_reviews($1)`, [latte]));
    expect(publicCount).toBe(1);
    const summary = await as(db, anon, (tx) => tx.query<{ average_rating: string; rating_count: number }>(
      `select average_rating, rating_count from public.product_rating_summary where product_id = $1`, [latte]));
    expect(summary.rows[0]).toEqual({ average_rating: "4.00", rating_count: 1 });

    // The author still sees their own hidden review.
    expect(await as(db, user(bob), (tx) => scalar<boolean>(tx, `select is_hidden from public.reviews where id = $1`, [bobReview]))).toBe(true);
    expect(await scalar<number>(db, `select count(*)::int from public.audit_log where action = 'review.hide'`)).toBe(1);
  });
});

describe("staff permissions", () => {
  it("editors manage the menu; moderators and customers cannot", async () => {
    await as(db, user(editor), (tx) => tx.query(`update public.products set price_min = 3250 where id = $1`, [espresso]));
    expect(await scalar<number>(db, `select price_min from public.products where id = $1`, [espresso])).toBe(3250);
    await as(db, user(moderator), (tx) => tx.query(`update public.products set price_min = 1 where id = $1`, [espresso]));
    await as(db, user(alice), (tx) => tx.query(`update public.products set price_min = 1 where id = $1`, [espresso]));
    expect(await scalar<number>(db, `select price_min from public.products where id = $1`, [espresso])).toBe(3250);
    await expect(as(db, user(alice), (tx) => tx.query(`insert into public.categories (slug, name_ar) values ('x', 'x')`))).rejects.toThrow(RLS);
    await db.query(`update public.products set price_min = 3000 where id = $1`, [espresso]);
  });

  it("menu changes are written to the audit log with the actor", async () => {
    const actor = await scalar<string>(db, `select actor_id from public.audit_log where action = 'products.update' and actor_id is not null order by id limit 1`);
    expect(actor).toBe(editor);
  });

  it("customers cannot escalate their own privileges", async () => {
    await expect(as(db, user(alice), (tx) => tx.query(`insert into public.staff_roles (user_id, role) values ($1, 'admin')`, [alice]))).rejects.toThrow(RLS);
    await expect(as(db, user(alice), (tx) => tx.query(`update public.profiles set is_banned = false where id = $1`, [alice]))).rejects.toThrow(RLS);
    await expect(as(db, user(alice), (tx) => tx.query(`select public.admin_grant_role($1, 'admin')`, [alice]))).rejects.toThrow(/permission denied|cannot change your own role/);
    await expect(as(db, user(alice), (tx) => tx.query(`insert into public.audit_log (action) values ('x.y')`))).rejects.toThrow(RLS);
    expect(await scalar<number>(db, `select count(*)::int from public.staff_roles where user_id = $1`, [alice])).toBe(0);
  });

  it("customers can update only their display name and locale", async () => {
    await as(db, user(alice), (tx) => tx.query(`update public.profiles set display_name = 'Ali' where id = $1`, [alice]));
    expect(await scalar<string>(db, `select display_name from public.profiles where id = $1`, [alice])).toBe("Ali");
    await as(db, user(alice), (tx) => tx.query(`update public.profiles set display_name = 'Hacker' where id = $1`, [bob]));
    expect(await scalar<string>(db, `select display_name from public.profiles where id = $1`, [bob])).not.toBe("Hacker");
    const visibleProfiles = await as(db, user(alice), (tx) => scalar<number>(tx, `select count(*)::int from public.profiles`));
    expect(visibleProfiles).toBe(1);
  });

  it("admins list users and ban customers, but not the owner, themselves or other admins", async () => {
    const list = await as(db, user(admin), (tx) => tx.query<{ email: string }>(`select email from public.admin_list_users()`));
    expect(list.rows.length).toBeGreaterThanOrEqual(7);
    await expect(as(db, user(moderator), (tx) => tx.query(`select public.admin_set_ban($1, true, null)`, [bob]))).rejects.toThrow(/permission denied/);

    await as(db, user(admin), (tx) => tx.query(`select public.admin_set_ban($1, true, 'abuse')`, [bob]));
    expect(await scalar<boolean>(db, `select is_banned from public.profiles where id = $1`, [bob])).toBe(true);
    await expect(as(db, user(bob), (tx) => tx.query(`update public.reviews set rating = 1 where user_id = $1`, [bob]))).resolves.toBeDefined();
    expect(await scalar<number>(db, `select rating from public.reviews where user_id = $1 and product_id = $2`, [bob, latte])).toBe(2);
    await as(db, user(admin), (tx) => tx.query(`select public.admin_set_ban($1, false, null)`, [bob]));

    await expect(as(db, user(admin), (tx) => tx.query(`select public.admin_set_ban($1, true, null)`, [owner]))).rejects.toThrow(/owner cannot be banned/);
    await expect(as(db, user(admin), (tx) => tx.query(`select public.admin_set_ban($1, true, null)`, [admin]))).rejects.toThrow(/own account/);
    const admin2 = await createUser(db);
    await setRole(db, admin2, "admin");
    await expect(as(db, user(admin), (tx) => tx.query(`select public.admin_set_ban($1, true, null)`, [admin2]))).rejects.toThrow(/only the owner/);
    await scalar(db, `delete from public.staff_roles where user_id = $1`, [admin2]);
  });

  it("only the owner grants admin; nobody grants owner; owner role cannot be removed", async () => {
    await expect(as(db, user(admin), (tx) => tx.query(`select public.admin_grant_role($1, 'admin')`, [alice]))).rejects.toThrow(/only the owner/);
    await as(db, user(admin), (tx) => tx.query(`select public.admin_grant_role($1, 'moderator')`, [alice]));
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [alice])).toBe("moderator");
    await as(db, user(admin), (tx) => tx.query(`select public.admin_revoke_role($1)`, [alice]));

    await expect(as(db, user(owner), (tx) => tx.query(`select public.admin_grant_role($1, 'owner')`, [alice]))).rejects.toThrow(/ownership transfer/);
    await expect(as(db, user(owner), (tx) => tx.query(`select public.admin_revoke_role($1)`, [owner]))).rejects.toThrow(/owner role cannot be removed/);
    await expect(as(db, user(admin), (tx) => tx.query(`select public.admin_revoke_role($1)`, [owner]))).rejects.toThrow(/owner role cannot be removed/);

    const unconfirmed = await createUser(db, { confirmed: false });
    await expect(as(db, user(owner), (tx) => tx.query(`select public.admin_grant_role($1, 'editor')`, [unconfirmed]))).rejects.toThrow(/confirmed email/);
    expect(await scalar<number>(db, `select count(*)::int from public.audit_log where action in ('staff.grant', 'staff.revoke')`)).toBeGreaterThanOrEqual(2);
  });

  it("a second owner can never exist", async () => {
    await expect(db.query(`update public.staff_roles set role = 'owner' where user_id = $1`, [admin])).rejects.toThrow(/staff_roles_single_owner|duplicate/);
    await expect(db.query(`select public.bootstrap_owner('admin@example.test')`)).rejects.toThrow(/owner already exists/);
  });

  it("banned staff lose their permissions immediately", async () => {
    await db.query(`update public.profiles set is_banned = true where id = $1`, [editor]);
    await as(db, user(editor), (tx) => tx.query(`update public.products set price_min = 1 where id = $1`, [espresso]));
    expect(await scalar<number>(db, `select price_min from public.products where id = $1`, [espresso])).toBe(3000);
    await db.query(`update public.profiles set is_banned = false where id = $1`, [editor]);
  });
});

describe("ownership transfer", () => {
  it("rejects requests from non-owners and to non-admins", async () => {
    await expect(as(db, user(admin), (tx) => tx.query(`select public.request_ownership_transfer($1)`, [editor]))).rejects.toThrow(/permission denied/);
    await expect(as(db, user(owner), (tx) => tx.query(`select public.request_ownership_transfer($1)`, [editor]))).rejects.toThrow(/active admin/);
  });

  it("only the invited admin can accept, and expired requests do nothing", async () => {
    const id = await as(db, user(owner), (tx) => scalar<string>(tx, `select public.request_ownership_transfer($1)`, [admin]));
    await expect(as(db, user(editor), (tx) => tx.query(`select public.accept_ownership_transfer($1)`, [id]))).rejects.toThrow(/not found/);
    await db.query(`update public.ownership_transfers set created_at = now() - interval '3 days', expires_at = now() - interval '1 day' where id = $1`, [id]);
    const result = await as(db, user(admin), (tx) => scalar<string>(tx, `select public.accept_ownership_transfer($1)`, [id]));
    expect(result).toBe("expired");
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [owner])).toBe("owner");
  });

  it("moves ownership atomically and keeps exactly one owner", async () => {
    const id = await as(db, user(owner), (tx) => scalar<string>(tx, `select public.request_ownership_transfer($1)`, [admin]));
    const result = await as(db, user(admin), (tx) => scalar<string>(tx, `select public.accept_ownership_transfer($1)`, [id]));
    expect(result).toBe("accepted");
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [admin])).toBe("owner");
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [owner])).toBe("admin");
    expect(await scalar<number>(db, `select count(*)::int from public.staff_roles where role = 'owner'`)).toBe(1);
    expect(await scalar<number>(db, `select count(*)::int from public.audit_log where action = 'ownership.accept'`)).toBe(1);
    await expect(as(db, user(admin), (tx) => tx.query(`select public.accept_ownership_transfer($1)`, [id]))).rejects.toThrow(/no longer pending/);
  });

  it("the previous owner can no longer transfer; the invited user can decline", async () => {
    await expect(as(db, user(owner), (tx) => tx.query(`select public.request_ownership_transfer($1)`, [admin]))).rejects.toThrow(/permission denied|only the current owner/);
    // Transfer back so later suites keep the original owner.
    const back = await as(db, user(admin), (tx) => scalar<string>(tx, `select public.request_ownership_transfer($1)`, [owner]));
    await as(db, user(owner), (tx) => tx.query(`select public.cancel_ownership_transfer($1)`, [back]));
    expect(await scalar<string>(db, `select status from public.ownership_transfers where id = $1`, [back])).toBe("declined");
    const again = await as(db, user(admin), (tx) => scalar<string>(tx, `select public.request_ownership_transfer($1)`, [owner]));
    expect(await as(db, user(owner), (tx) => scalar<string>(tx, `select public.accept_ownership_transfer($1)`, [again]))).toBe("accepted");
    expect(await scalar<string>(db, `select role from public.staff_roles where user_id = $1`, [owner])).toBe("owner");
  });
});

describe("pages: drafts, publish, history", () => {
  it("editors save drafts that visitors cannot see; publishing needs pages.publish", async () => {
    const pageId = await as(db, user(editor), (tx) =>
      scalar<string>(tx, `insert into public.pages (slug, title_ar) values ('offers', 'العروض') returning id`));
    const v1 = await as(db, user(editor), (tx) =>
      scalar<string>(tx, `insert into public.page_versions (page_id, content) values ($1, '{"root":{"props":{}},"content":[{"type":"Heading","props":{"text":"v1"}}]}') returning id`, [pageId]));
    expect(await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.pages where id = $1`, [pageId]))).toBe(0);
    expect(await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.page_versions where id = $1`, [v1]))).toBe(0);

    await expect(as(db, user(editor), (tx) => tx.query(`select public.publish_page($1, $2)`, [pageId, v1]))).rejects.toThrow(/permission denied/);
    await expect(as(db, user(editor), (tx) => tx.query(`update public.pages set status = 'published' where id = $1`, [pageId]))).rejects.toThrow(RLS);
    await as(db, user(admin), (tx) => tx.query(`select public.publish_page($1, $2)`, [pageId, v1]));

    const published = await as(db, anon, (tx) => scalar<string>(tx,
      `select v.content->'content'->0->'props'->>'text' from public.pages p join public.page_versions v on v.id = p.published_version_id where p.slug = 'offers'`));
    expect(published).toBe("v1");

    // A newer draft does not change what visitors see.
    const v2 = await as(db, user(editor), (tx) =>
      scalar<string>(tx, `insert into public.page_versions (page_id, content) values ($1, '{"root":{"props":{}},"content":[{"type":"Heading","props":{"text":"v2"}}]}') returning id`, [pageId]));
    expect(await scalar<number>(db, `select version_no from public.page_versions where id = $1`, [v2])).toBe(2);
    expect(await as(db, anon, (tx) => scalar<number>(tx, `select count(*)::int from public.page_versions where id = $1`, [v2]))).toBe(0);

    // Restore = publish an older version again.
    await as(db, user(admin), (tx) => tx.query(`select public.publish_page($1, $2)`, [pageId, v2]));
    await as(db, user(admin), (tx) => tx.query(`select public.publish_page($1, $2)`, [pageId, v1]));
    expect(await scalar<string>(db, `select published_version_id from public.pages where id = $1`, [pageId])).toBe(v1);
  });

  it("versions cannot be edited or deleted through the API", async () => {
    await expect(as(db, user(admin), (tx) => tx.query(`update public.page_versions set content = '{}'`))).rejects.toThrow(RLS);
    await expect(as(db, user(admin), (tx) => tx.query(`delete from public.page_versions`))).rejects.toThrow(RLS);
  });

  it("cannot publish a version from another page", async () => {
    const other = await as(db, user(editor), (tx) => scalar<string>(tx, `insert into public.pages (slug, title_ar) values ('about', 'من نحن') returning id`));
    const offersVersion = await scalar<string>(db, `select published_version_id from public.pages where slug = 'offers'`);
    await expect(as(db, user(admin), (tx) => tx.query(`select public.publish_page($1, $2)`, [other, offersVersion]))).rejects.toThrow(/does not belong/);
  });

  it("reserved slugs are rejected", async () => {
    await expect(as(db, user(editor), (tx) => tx.query(`insert into public.pages (slug, title_ar) values ('admin', 'x')`))).rejects.toThrow(/check/);
  });
});

describe("settings and uploads", () => {
  it("only settings.edit can change settings, and changes are audited", async () => {
    await as(db, user(alice), (tx) => tx.query(`update public.site_settings set value = '{}' where key = 'contact'`));
    expect(await scalar<string>(db, `select value->>'phone_display' from public.site_settings where key = 'contact'`)).toBe("0787 001 0580");
    await as(db, user(admin), (tx) => tx.query(`update public.site_settings set value = value || '{"accent":"#e0a35b"}' where key = 'theme'`));
    expect(await scalar<number>(db, `select count(*)::int from public.audit_log where action = 'site_settings.update'`)).toBe(1);
  });

  it("upload rules can never allow SVG or oversized files", async () => {
    await expect(as(db, user(admin), (tx) => tx.query(`update public.upload_rules set allowed_mime_types = array['image/svg+xml'] where purpose = 'product_image'`))).rejects.toThrow(/check/);
    await expect(as(db, user(admin), (tx) => tx.query(`update public.upload_rules set max_bytes = 50000000 where purpose = 'product_image'`))).rejects.toThrow(/check/);
    await as(db, user(admin), (tx) => tx.query(`update public.upload_rules set max_bytes = 1048576 where purpose = 'product_image'`));
    expect(await scalar<number>(db, `select max_bytes from public.upload_rules where purpose = 'product_image'`)).toBe(1048576);
  });
});
