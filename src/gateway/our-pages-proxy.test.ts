import { describe, expect, it } from "vitest";
import { extractProxySlug, isOurPagesApiPath } from "./our-pages-proxy.js";

describe("isOurPagesApiPath", () => {
  it("returns true for /ourpages-api/ paths", () => {
    expect(isOurPagesApiPath("/ourpages-api/my-api")).toBe(true);
    expect(isOurPagesApiPath("/ourpages-api/my-api/endpoint")).toBe(true);
  });

  it("returns false for non-matching paths", () => {
    expect(isOurPagesApiPath("/ourpages/slug")).toBe(false);
    expect(isOurPagesApiPath("/api/something")).toBe(false);
    expect(isOurPagesApiPath("/")).toBe(false);
  });
});

describe("extractProxySlug", () => {
  it("extracts slug with no rest path", () => {
    expect(extractProxySlug("/ourpages-api/my-api")).toEqual({
      slug: "my-api",
      rest: "",
    });
  });

  it("extracts slug and rest path", () => {
    expect(extractProxySlug("/ourpages-api/my-api/v1/data")).toEqual({
      slug: "my-api",
      rest: "/v1/data",
    });
  });

  it("handles slug with trailing slash", () => {
    expect(extractProxySlug("/ourpages-api/my-api/")).toEqual({
      slug: "my-api",
      rest: "/",
    });
  });
});
