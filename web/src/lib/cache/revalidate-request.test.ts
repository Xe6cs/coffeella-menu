import { describe, expect, it } from "vitest";
import { decideRevalidation, safeEqual } from "./revalidate-request";

const SECRET = "s".repeat(40);

describe("revalidation endpoint rules", () => {
  it("is disabled without a strong secret", () => {
    expect(decideRevalidation({ configuredSecret: undefined, authorizationHeader: `Bearer ${SECRET}`, body: null })).toEqual({ status: 404 });
    expect(decideRevalidation({ configuredSecret: "short", authorizationHeader: "Bearer short", body: null })).toEqual({ status: 404 });
  });

  it("rejects missing or wrong tokens", () => {
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: null, body: null })).toEqual({ status: 401 });
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: SECRET, body: null })).toEqual({ status: 401 });
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: `Bearer ${SECRET}x`, body: null })).toEqual({ status: 401 });
  });

  it("revalidates everything public for webhook payloads", () => {
    const webhook = { type: "UPDATE", table: "products", record: { id: "x" } };
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: `Bearer ${SECRET}`, body: webhook })).toEqual({
      status: 200,
      tags: ["menu", "settings"],
    });
  });

  it("accepts only known tags", () => {
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: `Bearer ${SECRET}`, body: { tags: ["menu", "menu", "other"] } })).toEqual({
      status: 200,
      tags: ["menu"],
    });
    expect(decideRevalidation({ configuredSecret: SECRET, authorizationHeader: `Bearer ${SECRET}`, body: { tags: ["users"] } })).toEqual({
      status: 400,
      error: "no valid tags",
    });
  });

  it("compares secrets in constant time and correctly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
