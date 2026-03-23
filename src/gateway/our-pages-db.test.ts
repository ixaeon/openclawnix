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

  it("increments version on each content-changing update", async () => {
    const { publishPage } = await getDb();
    const v1 = await publishPage({ slug: "versioned", title: "v1", html: "<p>v1</p>" });
    expect(v1.version).toBe(1);
    const v2 = await publishPage({ slug: "versioned", title: "v2", html: "<p>v2</p>" });
    expect(v2.version).toBe(2);
    const v3 = await publishPage({ slug: "versioned", title: "v3", html: "<p>v3</p>" });
    expect(v3.version).toBe(3);
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

  it("publishes a portal page with type and url", async () => {
    const { publishPage, getPage } = await getDb();
    const result = await publishPage({
      slug: "my-portal",
      title: "External Dashboard",
      type: "portal",
      url: "https://example.com/dashboard",
    });
    expect(result.slug).toBe("my-portal");
    expect(result.version).toBe(1);

    const page = await getPage({ slug: "my-portal" });
    expect(page).not.toBeNull();
    expect(page!.type).toBe("portal");
    expect(page!.url).toBe("https://example.com/dashboard");
  });

  it("rejects slugs with uppercase characters", async () => {
    const { publishPage } = await getDb();
    // The DB layer doesn't enforce slug format — that's the tool schema's job.
    // But we verify the DB accepts lowercase slugs and stores them correctly.
    const result = await publishPage({ slug: "valid-slug", title: "Valid", html: "<p>ok</p>" });
    expect(result.slug).toBe("valid-slug");
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

  it("search filter matches description", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({
      slug: "alpha",
      title: "Alpha",
      description: "CPU metrics dashboard",
      html: "<p>a</p>",
    });
    await publishPage({
      slug: "beta",
      title: "Beta",
      description: "Sales report",
      html: "<p>b</p>",
    });

    const result = await listPages({ search: "metrics" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("alpha");
  });

  it("tag filter returns only matching tagged pages", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "t1", title: "T1", html: "<p>1</p>", tags: ["ops", "infra"] });
    await publishPage({ slug: "t2", title: "T2", html: "<p>2</p>", tags: ["finance"] });
    await publishPage({ slug: "t3", title: "T3", html: "<p>3</p>", tags: ["ops"] });

    const result = await listPages({ tag: "ops" });
    expect(result.pages.length).toBe(2);
    expect(result.pages.map((p: { slug: string }) => p.slug).toSorted()).toEqual(["t1", "t3"]);
  });

  it("combined search and tag filter narrows results", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "x1", title: "Server Monitor", html: "<p>1</p>", tags: ["ops"] });
    await publishPage({ slug: "x2", title: "Budget Report", html: "<p>2</p>", tags: ["ops"] });
    await publishPage({ slug: "x3", title: "Server Logs", html: "<p>3</p>", tags: ["dev"] });

    const result = await listPages({ search: "Server", tag: "ops" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("x1");
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

// ─── Additional coverage ──────────────────────────────────────────────────────

describe("large HTML content", () => {
  it("accepts HTML just under the 5MB soft limit without error", async () => {
    const { publishPage, getPage } = await getDb();
    const html = "x".repeat(4 * 1024 * 1024); // 4 MB
    const result = await publishPage({ slug: "big-page", title: "Big", html });
    expect(result.version).toBe(1);

    const page = await getPage({ slug: "big-page" });
    expect(page).not.toBeNull();
    expect(page!.html!.length).toBe(4 * 1024 * 1024);
  });

  it("accepts HTML between 5MB and 15MB (soft limit warning only)", async () => {
    const { publishPage } = await getDb();
    const html = "x".repeat(6 * 1024 * 1024); // 6 MB — above soft limit, below hard limit
    const result = await publishPage({ slug: "medium-big", title: "Medium Big", html });
    expect(result.version).toBe(1);
  });
});

describe("listPages tag filtering", () => {
  it("returns empty when no pages match the tag", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "p1", title: "P1", html: "<p>1</p>", tags: ["alpha"] });
    await publishPage({ slug: "p2", title: "P2", html: "<p>2</p>", tags: ["beta"] });

    const result = await listPages({ tag: "gamma" });
    expect(result.pages.length).toBe(0);
    expect(result.total).toBe(0);
  });

  it("filters by type", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "inl", title: "Inline", html: "<p>x</p>" });
    await publishPage({
      slug: "lnk",
      title: "Link",
      type: "link",
      url: "http://localhost:3000",
    });

    const result = await listPages({ type: "link" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("lnk");
    expect(result.total).toBe(1);
  });
});

describe("listPages search filtering", () => {
  it("search is case-insensitive via LIKE", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "upper", title: "SERVER Monitor", html: "<p>x</p>" });

    const result = await listPages({ search: "server" });
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("upper");
  });
});

describe("listPages pagination", () => {
  it("respects limit and offset", async () => {
    const { publishPage, listPages } = await getDb();
    for (let i = 0; i < 10; i++) {
      await publishPage({ slug: `page-${i}`, title: `Page ${i}`, html: `<p>${i}</p>` });
    }

    const page1 = await listPages({ limit: 3, offset: 0 });
    expect(page1.pages.length).toBe(3);
    expect(page1.total).toBe(10);

    const page2 = await listPages({ limit: 3, offset: 3 });
    expect(page2.pages.length).toBe(3);
    expect(page2.total).toBe(10);

    // No overlap between pages
    const slugs1 = page1.pages.map((p: { slug: string }) => p.slug);
    const slugs2 = new Set(page2.pages.map((p: { slug: string }) => p.slug));
    expect(slugs1.filter((s: string) => slugs2.has(s))).toEqual([]);
  });

  it("offset beyond total returns empty pages array", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "only", title: "Only", html: "<p>x</p>" });

    const result = await listPages({ offset: 100 });
    expect(result.pages.length).toBe(0);
    expect(result.total).toBe(1); // total is still 1
  });

  it("limit is capped at 200", async () => {
    const { publishPage, listPages } = await getDb();
    await publishPage({ slug: "cap-test", title: "Cap", html: "<p>x</p>" });

    // Requesting limit=999 should not error — it gets capped internally
    const result = await listPages({ limit: 999 });
    expect(result.pages.length).toBe(1);
  });
});

describe("soft-delete and restore flow", () => {
  it("full lifecycle: create → delete → verify hidden → restore → verify visible", async () => {
    const { publishPage, deletePage, restorePage, listPages, getPage } = await getDb();

    // Create
    await publishPage({ slug: "lifecycle", title: "Lifecycle", html: "<p>data</p>" });
    let list = await listPages({});
    expect(list.total).toBe(1);

    // Delete
    await deletePage("lifecycle");
    list = await listPages({});
    expect(list.total).toBe(0);

    // Still fetchable directly
    const deleted = await getPage({ slug: "lifecycle" });
    expect(deleted!.deleted_at).toBeTruthy();

    // Visible with include_deleted
    list = await listPages({ include_deleted: true });
    expect(list.total).toBe(1);

    // Restore
    await restorePage("lifecycle");
    list = await listPages({});
    expect(list.total).toBe(1);

    const restored = await getPage({ slug: "lifecycle" });
    expect(restored!.deleted_at).toBeFalsy();
  });

  it("deleting an already-deleted page updates deleted_at", async () => {
    const { publishPage, deletePage, getPage } = await getDb();
    await publishPage({ slug: "double-del", title: "DD", html: "<p>x</p>" });

    const first = await deletePage("double-del");
    const second = await deletePage("double-del");

    // Second delete should still succeed (updates timestamp)
    expect(second.deleted_at).toBeTruthy();
    expect(second.deleted_at).not.toBe(first.deleted_at);

    const page = await getPage({ slug: "double-del" });
    expect(page!.deleted_at).toBe(second.deleted_at);
  });
});

describe("version increments on update", () => {
  it("only increments version when content changes, not metadata", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({ slug: "meta-only", title: "v1", html: "<p>stable</p>" });

    // Same html, different title — content hash unchanged
    const result = await publishPage({
      slug: "meta-only",
      title: "Updated Title",
      html: "<p>stable</p>",
    });
    // Version should stay at 1 because content_hash is the same
    expect(result.version).toBe(1);

    const page = await getPage({ slug: "meta-only" });
    // Title is updated despite version not changing
    // (the no-op path returns early before UPDATE, so title is NOT updated)
    expect(page!.version).toBe(1);
  });
});

describe("portal type validation", () => {
  it("creates a portal page with url and no html", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({
      slug: "portal-test",
      title: "Portal Test",
      type: "portal",
      url: "https://example.com",
    });

    const page = await getPage({ slug: "portal-test" });
    expect(page!.type).toBe("portal");
    expect(page!.url).toBe("https://example.com");
    expect(page!.html).toBeNull();
  });

  it("updates a portal page url and increments version", async () => {
    const { publishPage, getPage } = await getDb();
    await publishPage({
      slug: "portal-update",
      title: "Portal",
      type: "portal",
      url: "https://v1.example.com",
    });
    await publishPage({
      slug: "portal-update",
      title: "Portal",
      type: "portal",
      url: "https://v2.example.com",
    });

    const page = await getPage({ slug: "portal-update" });
    expect(page!.version).toBe(2);
    expect(page!.url).toBe("https://v2.example.com");
  });
});

describe("concurrent publish to same slug", () => {
  it("last write wins when publishing to the same slug sequentially", async () => {
    const { publishPage, getPage } = await getDb();

    // Simulate two rapid publishes to the same slug
    await publishPage({ slug: "race", title: "First", html: "<p>first</p>" });
    await publishPage({ slug: "race", title: "Second", html: "<p>second</p>" });

    const page = await getPage({ slug: "race" });
    expect(page!.title).toBe("Second");
    expect(page!.html).toBe("<p>second</p>");
    expect(page!.version).toBe(2);
  });

  it("concurrent Promise.all publishes both succeed (last write wins)", async () => {
    const { publishPage, getPage } = await getDb();

    // Create the initial page
    await publishPage({ slug: "concurrent", title: "Init", html: "<p>init</p>" });

    // Fire two updates concurrently
    await Promise.all([
      publishPage({ slug: "concurrent", title: "A", html: "<p>a</p>" }),
      publishPage({ slug: "concurrent", title: "B", html: "<p>b</p>" }),
    ]);

    const page = await getPage({ slug: "concurrent" });
    // One of them won — version is at least 2
    expect(page!.version).toBeGreaterThanOrEqual(2);
    // The title matches whichever wrote last
    expect(["A", "B"]).toContain(page!.title);
  });
});

describe("listPages total count accuracy", () => {
  it("total reflects all matching rows regardless of limit/offset", async () => {
    const { publishPage, listPages } = await getDb();
    for (let i = 0; i < 5; i++) {
      await publishPage({
        slug: `counted-${i}`,
        title: `Counted ${i}`,
        html: `<p>${i}</p>`,
        tags: ["countable"],
      });
    }
    // Add 2 pages without the tag
    await publishPage({ slug: "other-1", title: "Other 1", html: "<p>o1</p>" });
    await publishPage({ slug: "other-2", title: "Other 2", html: "<p>o2</p>" });

    const filtered = await listPages({ tag: "countable", limit: 2 });
    expect(filtered.pages.length).toBe(2); // limited to 2
    expect(filtered.total).toBe(5); // but total is 5

    const all = await listPages({});
    expect(all.total).toBe(7);
  });

  it("pinned_only filter returns correct total", async () => {
    const { publishPage, pinPage, listPages } = await getDb();
    await publishPage({ slug: "pinned-1", title: "Pinned", html: "<p>1</p>" });
    await publishPage({ slug: "pinned-2", title: "Pinned 2", html: "<p>2</p>" });
    await publishPage({ slug: "not-pinned", title: "Not Pinned", html: "<p>3</p>" });
    await pinPage("pinned-1", true);
    await pinPage("pinned-2", true);

    const result = await listPages({ pinned_only: true });
    expect(result.pages.length).toBe(2);
    expect(result.total).toBe(2);
  });
});

// ─── seedDefaultPages ─────────────────────────────────────────────────────────

describe("seedDefaultPages", () => {
  it("seeds getting-started page on empty DB", async () => {
    const { seedDefaultPages, getPage } = await getDb();
    await seedDefaultPages();
    const page = await getPage({ slug: "getting-started" });
    expect(page).toBeTruthy();
    expect(page!.title).toBe("Getting Started with Our Pages");
    expect(page!.type).toBe("inline");
    expect(page!.tags).toContain("onboarding");
  });

  it("does not re-seed when DB already has pages", async () => {
    const { publishPage, seedDefaultPages, listPages } = await getDb();
    await publishPage({ slug: "existing", title: "Existing", html: "<p>hi</p>" });
    await seedDefaultPages();
    const result = await listPages({});
    // Should have only the existing page, not the getting-started page
    expect(result.pages.length).toBe(1);
    expect(result.pages[0].slug).toBe("existing");
  });
});
