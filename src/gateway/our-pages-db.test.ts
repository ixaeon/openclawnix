import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// We test the DB layer in isolation using a real temp SQLite DB.
// Mock config paths to use a temp dir so tests don't touch real state.

const mocks = vi.hoisted(() => ({
  resolveStateDir: vi.fn(),
}));

vi.mock("../config/paths.js", () => ({
  resolveStateDir: mocks.resolveStateDir,
}));

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "our-pages-test-"));
  mocks.resolveStateDir.mockReturnValue(tmpDir);

  // Re-import fresh module for each test (reset singleton DB)
  vi.resetModules();
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function getDb() {
  const mod = await import("./our-pages-db.js");
  await mod.initOurPagesDb();
  return mod;
}

// ─── initOurPagesDb ──────────────────────────────────────────────────────────

describe("initOurPagesDb", () => {
  it("creates the our_pages table", async () => {
    const { initOurPagesDb } = await getDb();
    // Second call should not throw (idempotent CREATE IF NOT EXISTS)
    await expect(initOurPagesDb()).resolves.not.toThrow();
  });
});

// ─── publishPage ─────────────────────────────────────────────────────────────

describe("publishPage", () => {
  it("creates a new inline page", async () => {
    const { publishPage, getPage } = await getDb();
    const result = await publishPage({
      slug: "hello-world",
      title: "Hello World",
      html: "<h1>Hello</h1>",
    });
    expect(result.slug).toBe("hello-world");
    expect(result.version).toBe(1);

    const page = await getPage({ slug: "hello-world" });
    expect(page).not.toBeNull();
    expect(page!.title).toBe("Hello World");
    expect(page!.type).toBe("inline");
    expect(page!.version).toBe(1);
    expect(page!.deleted_at).toBeFalsy();
  });

  it("updates existing page and increments version", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({ slug: "my-page", title: "v1", html: "<p>v1</p>" });
    const result = await publishPage({ slug: "my-page", title: "v2", html: "<p>v2</p>" });

    expect(result.version).toBe(2);
    const page = await getPage({ slug: "my-page" });
    expect(page!.title).toBe("v2");
    expect(page!.version).toBe(2);
  });

  it("does NOT increment version when content is unchanged (no-op update)", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({ slug: "noop", title: "Same", html: "<p>same</p>" });
    const result = await publishPage({ slug: "noop", title: "Same", html: "<p>same</p>" });

    expect(result.version).toBe(1); // version should not change
    const page = await getPage({ slug: "noop" });
    expect(page!.version).toBe(1);
  });

  it("converts unknown type to 'safe'", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({ slug: "bad-type", title: "Bad", type: "banana", html: "<p>x</p>" });
    const page = await getPage({ slug: "bad-type" });
    expect(page!.type).toBe("safe");
  });

  it("rejects type='safe' explicitly from agent", async () => {
    const { publishPage } = await getDb();
    await expect(
      publishPage({ slug: "explicit-safe", title: "Safe", type: "safe", html: "<p>x</p>" }),
    ).rejects.toThrow("reserved for system use");
  });

  it("serializes and deserializes tags as array", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({
      slug: "tagged",
      title: "Tagged",
      html: "<p>hi</p>",
      tags: ["monitoring", "infra"],
    });
    const page = await getPage({ slug: "tagged" });
    expect(Array.isArray(page!.tags)).toBe(true);
    expect(page!.tags).toEqual(["monitoring", "infra"]);
  });

  it("rejects HTML exceeding 15MB hard limit", async () => {
    const { publishPage } = await getDb();
    const bigHtml = "x".repeat(16 * 1024 * 1024);
    await expect(publishPage({ slug: "too-big", title: "Big", html: bigHtml })).rejects.toThrow(
      "15 MB hard limit",
    );
  });

  it("restores a soft-deleted page on re-publish", async () => {
    const { publishPage, deletePage, getPage } = await getDb();
    await publishPage({ slug: "restore-me", title: "To Delete", html: "<p>x</p>" });
    await deletePage("restore-me");

    const deleted = await getPage({ slug: "restore-me" });
    expect(deleted!.deleted_at).toBeTruthy();

    // Re-publishing same slug with new content should clear deleted_at
    await publishPage({ slug: "restore-me", title: "Restored", html: "<p>new</p>" });
    const restored = await getPage({ slug: "restore-me" });
    expect(restored!.deleted_at).toBeFalsy();
  });
});

// ─── listPages ───────────────────────────────────────────────────────────────

describe("listPages", () => {
  it("returns { pages, total } shape", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "p1", title: "P1", html: "<p>1</p>" });
    await publishPage({ slug: "p2", title: "P2", html: "<p>2</p>" });

    const result = await listPages({});
    expect(result).toHaveProperty("pages");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.pages)).toBe(true);
    expect(result.pages.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it("excludes soft-deleted by default", async () => {
    const { publishPage, deletePage, listPages } = await getDb();
    await publishPage({ slug: "live", title: "Live", html: "<p>live</p>" });
    await publishPage({ slug: "dead", title: "Dead", html: "<p>dead</p>" });
    await deletePage("dead");

    const result = await listPages({});
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("live");
    expect(result.total).toBe(1);
  });

  it("includes soft-deleted when include_deleted=true", async () => {
    const { publishPage, deletePage, listPages } = await getDb();
    await publishPage({ slug: "alive", title: "Alive", html: "<p>alive</p>" });
    await publishPage({ slug: "trashed", title: "Trashed", html: "<p>trashed</p>" });
    await deletePage("trashed");

    const result = await listPages({ include_deleted: true });
    expect(result.pages.length).toBe(2);
    expect(result.total).toBe(2);
  });

  it("filters by tag", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "mon", title: "Monitor", html: "<p>m</p>", tags: ["monitoring"] });
    await publishPage({ slug: "fin", title: "Finance", html: "<p>f</p>", tags: ["finance"] });

    const result = await listPages({ tag: "monitoring" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("mon");
  });

  it("filters by search term", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "server", title: "Server Monitor", html: "<p>s</p>" });
    await publishPage({ slug: "budget", title: "Budget Tracker", html: "<p>b</p>" });

    const result = await listPages({ search: "server" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("server");
  });

  it("returns pinned pages first", async () => {
    const { publishPage, pinPage, listPages } = await getDb();
    await publishPage({ slug: "a", title: "A", html: "<p>a</p>" });
    await publishPage({ slug: "b", title: "B", html: "<p>b</p>" });
    await pinPage("b", true);

    const result = await listPages({});
    expect(result.pages[0].slug).toBe("b");
    expect(result.pages[0].pinned).toBe(true);
  });
});

// ─── getPage ─────────────────────────────────────────────────────────────────

describe("getPage", () => {
  it("returns null for unknown slug", async () => {
    const { getPage } = await getDb();
    const result = await getPage({ slug: "does-not-exist" });
    expect(result).toBeNull();
  });

  it("can fetch by id", async () => {
    const { publishPage, getPage } = await getDb();
    const created = await publishPage({ slug: "by-id", title: "By ID", html: "<p>x</p>" });
    const page = await getPage({ id: created.id as string });
    expect(page!.slug).toBe("by-id");
  });

  it("throws if neither slug nor id provided", async () => {
    const { getPage } = await getDb();
    await expect(getPage({})).rejects.toThrow("slug or id required");
  });
});

// ─── deletePage / restorePage ─────────────────────────────────────────────────

describe("deletePage / restorePage", () => {
  it("soft-deletes a page (sets deleted_at)", async () => {
    const { publishPage, deletePage, getPage } = await getDb();
    await publishPage({ slug: "to-delete", title: "Delete Me", html: "<p>x</p>" });
    const result = await deletePage("to-delete");

    expect(result.deleted_at).toBeTruthy();
    const page = await getPage({ slug: "to-delete" });
    expect(page!.deleted_at).toBeTruthy();
  });

  it("restores a soft-deleted page (clears deleted_at)", async () => {
    const { publishPage, deletePage, restorePage, getPage } = await getDb();
    await publishPage({ slug: "to-restore", title: "Restore Me", html: "<p>x</p>" });
    await deletePage("to-restore");
    await restorePage("to-restore");

    const page = await getPage({ slug: "to-restore" });
    expect(page!.deleted_at).toBeFalsy();
  });
});

// ─── pinPage ─────────────────────────────────────────────────────────────────

describe("pinPage", () => {
  it("pins and unpins a page", async () => {
    const { publishPage, pinPage, getPage } = await getDb();
    await publishPage({ slug: "pin-me", title: "Pin Me", html: "<p>x</p>" });

    await pinPage("pin-me", true);
    expect((await getPage({ slug: "pin-me" }))!.pinned).toBe(true);

    await pinPage("pin-me", false);
    expect((await getPage({ slug: "pin-me" }))!.pinned).toBe(false);
  });
});

// ─── getOurPagesStatus ────────────────────────────────────────────────────────

describe("getOurPagesStatus", () => {
  it("returns mode and count of live pages", async () => {
    const { publishPage, deletePage, getOurPagesStatus } = await getDb();
    await publishPage({ slug: "s1", title: "S1", html: "<p>1</p>" });
    await publishPage({ slug: "s2", title: "S2", html: "<p>2</p>" });
    await publishPage({ slug: "s3", title: "S3", html: "<p>3</p>" });
    await deletePage("s3"); // soft-deleted, should not count

    const status = await getOurPagesStatus("enabled");
    expect(status.mode).toBe("enabled");
    expect(status.count).toBe(2);
  });
});
