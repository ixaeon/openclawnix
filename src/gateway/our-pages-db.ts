import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";
import { requireNodeSqlite } from "../memory/sqlite.js";
import { ensureDir } from "../utils.js";

const SOFT_DELETE_DAYS = 30;
const HTML_SOFT_LIMIT_BYTES = 5 * 1024 * 1024; // 5 MB — log warning
const HTML_HARD_LIMIT_BYTES = 15 * 1024 * 1024; // 15 MB — reject

function resolveDbPath(): string {
  return path.join(resolveStateDir(), "our-pages.db");
}

async function openDb() {
  const { DatabaseSync } = requireNodeSqlite();
  const dbPath = resolveDbPath();
  await ensureDir(path.dirname(dbPath));
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA journal_mode = WAL");
  return db;
}

type DbInstance = Awaited<ReturnType<typeof openDb>>;
let _db: DbInstance | null = null;
let _dbInit: Promise<DbInstance> | null = null;

function getDb(): Promise<DbInstance> {
  if (_db) {
    return Promise.resolve(_db);
  }
  if (!_dbInit) {
    _dbInit = openDb().then((db) => {
      _db = db;
      return db;
    });
  }
  return _dbInit;
}

const VALID_TYPES = new Set(["inline", "link", "file"]);

export async function initOurPagesDb() {
  const db = await getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS our_pages (
      id              TEXT PRIMARY KEY,
      slug            TEXT UNIQUE NOT NULL,
      title           TEXT NOT NULL,
      description     TEXT,
      default_icon    TEXT DEFAULT '📄',
      type            TEXT NOT NULL DEFAULT 'inline'
                      CHECK(type IN ('inline','link','file','safe')),
      html            TEXT,
      url             TEXT,
      path            TEXT,
      content_hash    TEXT,
      version         INTEGER NOT NULL DEFAULT 1,
      source_skill    TEXT,
      source_session  TEXT,
      tags            TEXT,
      pinned          INTEGER NOT NULL DEFAULT 0,
      visibility      TEXT NOT NULL DEFAULT 'private'
                      CHECK(visibility IN ('private','public')),
      owner_id        TEXT,
      screenshot_path TEXT,
      favicon         TEXT,
      sync_id         TEXT,
      node_origin     TEXT,
      deleted_at      TEXT,
      created_at      TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    )
  `);
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_our_pages_slug    ON our_pages(slug)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_our_pages_updated        ON our_pages(updated_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_our_pages_deleted        ON our_pages(deleted_at)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_our_pages_type           ON our_pages(type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_our_pages_owner          ON our_pages(owner_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_our_pages_sync           ON our_pages(sync_id)`);

  // Purge soft-deleted rows older than 30 days on every startup
  purgeSoftDeleted(db);
}

function purgeSoftDeleted(db: DbInstance) {
  const cutoff = new Date(Date.now() - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM our_pages WHERE deleted_at IS NOT NULL AND deleted_at < ?").run(cutoff);
}

function hashContent(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

function resolveType(raw: unknown): string {
  if (raw == null) {
    return "inline";
  }
  if (typeof raw === "string" && VALID_TYPES.has(raw)) {
    return raw;
  }
  return "safe";
}

export type OurPageRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  default_icon: string;
  type: string;
  html: string | null;
  url: string | null;
  path: string | null;
  content_hash: string | null;
  version: number;
  source_skill: string | null;
  source_session: string | null;
  tags: string[];
  pinned: boolean;
  visibility: string;
  owner_id: string | null;
  screenshot_path: string | null;
  favicon: string | null;
  sync_id: string | null;
  node_origin: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

function deserializeRow(row: Record<string, unknown>): OurPageRow {
  return {
    ...(row as Omit<OurPageRow, "tags" | "pinned">),
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    pinned: row.pinned === 1,
  };
}

export async function publishPage(params: {
  slug: string;
  title: string;
  description?: string;
  default_icon?: string;
  type?: string;
  html?: string;
  url?: string;
  path?: string;
  tags?: string[];
  source_skill?: string;
  source_session?: string;
  favicon?: string;
}) {
  if (params.type === "safe") {
    throw new Error("type=safe is reserved for system use");
  }

  const resolvedType = resolveType(params.type);
  const content = params.html ?? params.url ?? params.path ?? "";

  // Size limits on inline HTML
  if (resolvedType === "inline" && params.html) {
    const bytes = Buffer.byteLength(params.html, "utf8");
    if (bytes > HTML_HARD_LIMIT_BYTES) {
      throw new Error(
        `HTML content exceeds 15 MB hard limit (${(bytes / 1024 / 1024).toFixed(1)} MB). Use a file-backed page or link type for large content.`,
      );
    }
    if (bytes > HTML_SOFT_LIMIT_BYTES) {
      console.warn(
        `[our-pages] Large inline HTML for slug "${params.slug}": ${(bytes / 1024 / 1024).toFixed(1)} MB (soft limit is 5 MB)`,
      );
    }
  }

  const newHash = hashContent(content);
  const now = new Date().toISOString();
  const db = await getDb();

  const existing = db.prepare("SELECT * FROM our_pages WHERE slug = ?").get(params.slug) as
    | Record<string, unknown>
    | undefined;

  if (existing) {
    if (existing.content_hash === newHash) {
      return { id: existing.id, slug: existing.slug, version: existing.version };
    }
    db.prepare(
      `
      UPDATE our_pages SET
        title = ?, description = ?, default_icon = ?, type = ?,
        html = ?, url = ?, path = ?, content_hash = ?,
        version = version + 1,
        source_skill = ?, source_session = ?, tags = ?,
        favicon = ?, updated_at = ?, deleted_at = NULL
      WHERE slug = ?
    `,
    ).run(
      params.title,
      params.description ?? null,
      params.default_icon ?? (existing.default_icon as string),
      resolvedType,
      params.html ?? null,
      params.url ?? null,
      params.path ?? null,
      newHash,
      params.source_skill ?? null,
      params.source_session ?? null,
      params.tags != null ? JSON.stringify(params.tags) : (existing.tags as string | null),
      params.favicon ?? null,
      now,
      params.slug,
    );
    const updated = db
      .prepare("SELECT version, updated_at FROM our_pages WHERE slug = ?")
      .get(params.slug) as { version: number; updated_at: string };
    return {
      id: existing.id as string,
      slug: params.slug,
      version: updated.version,
      updated_at: updated.updated_at,
    };
  }

  const id = randomUUID();
  db.prepare(
    `
    INSERT INTO our_pages
      (id, slug, title, description, default_icon, type, html, url, path,
       content_hash, version, source_skill, source_session, tags,
       pinned, visibility, owner_id, screenshot_path, favicon,
       sync_id, node_origin, deleted_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0, 'private', NULL, NULL, ?, NULL, NULL, NULL, ?, ?)
  `,
  ).run(
    id,
    params.slug,
    params.title,
    params.description ?? null,
    params.default_icon ?? "📄",
    resolvedType,
    params.html ?? null,
    params.url ?? null,
    params.path ?? null,
    newHash,
    params.source_skill ?? null,
    params.source_session ?? null,
    params.tags != null ? JSON.stringify(params.tags) : null,
    params.favicon ?? null,
    now,
    now,
  );
  return { id, slug: params.slug, version: 1, created_at: now };
}

export async function listPages(params: {
  tag?: string;
  type?: string;
  search?: string;
  pinned_only?: boolean;
  include_deleted?: boolean;
  limit?: number;
  offset?: number;
}) {
  const db = await getDb();
  const conditions: string[] = [];
  const args: (string | number | null)[] = [];

  if (!params.include_deleted) {
    conditions.push("deleted_at IS NULL");
  }
  if (params.type) {
    conditions.push("type = ?");
    args.push(params.type);
  }
  if (params.pinned_only) {
    conditions.push("pinned = 1");
  }
  if (params.search) {
    conditions.push("(title LIKE ? OR description LIKE ?)");
    args.push(`%${params.search}%`, `%${params.search}%`);
  }
  if (params.tag) {
    conditions.push("tags LIKE ?");
    args.push(`%"${params.tag}"%`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const rows = db
    .prepare(
      `SELECT * FROM our_pages ${where} ORDER BY pinned DESC, updated_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...args, limit, offset) as Record<string, unknown>[];

  const total = (
    db.prepare(`SELECT COUNT(*) as count FROM our_pages ${where}`).get(...args) as {
      count: number;
    }
  ).count;

  return { pages: rows.map(deserializeRow), total };
}

export async function getPage(params: { slug?: string; id?: string }) {
  const db = await getDb();
  let row: Record<string, unknown> | undefined;
  if (params.slug) {
    row = db.prepare("SELECT * FROM our_pages WHERE slug = ?").get(params.slug) as
      | Record<string, unknown>
      | undefined;
  } else if (params.id) {
    row = db.prepare("SELECT * FROM our_pages WHERE id = ?").get(params.id) as
      | Record<string, unknown>
      | undefined;
  } else {
    throw new Error("slug or id required");
  }
  return row ? deserializeRow(row) : null;
}

export async function deletePage(slug: string) {
  const now = new Date().toISOString();
  (await getDb()).prepare("UPDATE our_pages SET deleted_at = ? WHERE slug = ?").run(now, slug);
  return { slug, deleted_at: now };
}

export async function restorePage(slug: string) {
  (await getDb()).prepare("UPDATE our_pages SET deleted_at = NULL WHERE slug = ?").run(slug);
  return { slug, restored: true };
}

export async function pinPage(slug: string, pinned: boolean) {
  (await getDb())
    .prepare("UPDATE our_pages SET pinned = ? WHERE slug = ?")
    .run(pinned ? 1 : 0, slug);
  return { slug, pinned };
}

export async function getOurPagesStatus(mode: string) {
  const row = (await getDb())
    .prepare("SELECT COUNT(*) as count FROM our_pages WHERE deleted_at IS NULL")
    .get() as { count: number };
  return { mode, count: row.count };
}
