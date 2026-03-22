# Our Pages API Reference

This document covers the gateway RPC methods for Our Pages. These methods are available to agents via tool calls and to any gateway client via the standard RPC transport.

All methods are namespaced under `our_pages.*`.

---

## Mode Enforcement

Every RPC method checks the current `ourPages.mode` configuration before executing. The mode is resolved fresh on each request (not cached).

| Method              | `enabled` | `read-only` | `disabled` |
| ------------------- | --------- | ----------- | ---------- |
| `our_pages.status`  | Allowed   | Allowed     | Allowed    |
| `our_pages.list`    | Allowed   | Allowed     | Error      |
| `our_pages.get`     | Allowed   | Allowed     | Error      |
| `our_pages.publish` | Allowed   | Error       | Error      |
| `our_pages.delete`  | Allowed   | Error       | Error      |
| `our_pages.restore` | Allowed   | Error       | Error      |
| `our_pages.pin`     | Allowed   | Error       | Error      |

When a method is blocked by mode, it returns error code `INVALID_REQUEST` with a message like `"Our Pages is disabled"` or `"Our Pages is read-only"`.

---

## Error Codes

| Code              | When                                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `INVALID_REQUEST` | Mode blocks the operation, page not found, type=safe attempted, HTML exceeds 15 MB hard limit, or missing required parameters |

---

## `our_pages.status`

Query the current mode and count of live (non-deleted) pages.

### Parameters

| Field  | Type | Required | Description            |
| ------ | ---- | -------- | ---------------------- |
| (none) | —    | —        | No parameters required |

### Response

```typescript
{
  mode: "enabled" | "read-only" | "disabled";
  count: number; // count of non-deleted pages
}
```

### Example

```typescript
const result = await gateway.request("our_pages.status", {});
// { mode: "enabled", count: 12 }
```

---

## `our_pages.publish`

Create a new page or update an existing one. If a page with the given slug already exists, it is updated in place. The version increments only when the content hash changes.

### Parameters

| Field            | Type       | Required | Description                                                             |
| ---------------- | ---------- | -------- | ----------------------------------------------------------------------- |
| `slug`           | `string`   | Yes      | URL-safe kebab-case identifier. Pattern: `^[a-z0-9-]+$`                 |
| `title`          | `string`   | Yes      | Display title for the page                                              |
| `description`    | `string`   | No       | Short description shown on the page card                                |
| `default_icon`   | `string`   | No       | Single emoji icon (default: `📄`)                                       |
| `type`           | `string`   | No       | One of `"inline"`, `"link"`, `"file"`, `"portal"` (default: `"inline"`) |
| `html`           | `string`   | No       | HTML content for inline pages                                           |
| `url`            | `string`   | No       | Target URL for link and portal pages                                    |
| `path`           | `string`   | No       | Filesystem path for file pages                                          |
| `tags`           | `string[]` | No       | Array of tag strings for filtering                                      |
| `source_skill`   | `string`   | No       | Name of the originating skill                                           |
| `source_session` | `string`   | No       | ID of the originating session                                           |
| `favicon`        | `string`   | No       | Favicon URL or data URI                                                 |

### Response

```typescript
// On create:
{
  id: string; // UUID
  slug: string;
  version: 1;
  created_at: string; // ISO 8601 timestamp
}

// On update (content changed):
{
  id: string;
  slug: string;
  version: number; // previous version + 1
  updated_at: string;
}

// On no-op (content identical):
{
  id: string;
  slug: string;
  version: number; // unchanged
}
```

### Errors

- `type=safe is reserved for system use` — Explicitly passing `type: "safe"` is rejected.
- `HTML content exceeds 15 MB hard limit` — Inline HTML is too large. Use `file` or `link` type instead.

### Examples

**Create an inline page:**

```typescript
const result = await gateway.request("our_pages.publish", {
  slug: "server-monitor",
  title: "Server Monitor",
  default_icon: "📊",
  type: "inline",
  html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Server Monitor</title></head>
<body style="background:#0d1117;color:#c9d1d9;font-family:system-ui">
  <h1>Server Monitor</h1>
  <div id="stats">Loading...</div>
  <script>
    document.getElementById("stats").textContent = "CPU: 42%, Memory: 3.2 GB";
  </script>
</body>
</html>`,
  tags: ["monitoring", "infra"],
});
// { id: "a1b2c3...", slug: "server-monitor", version: 1, created_at: "2026-03-22T..." }
```

**Create a link page:**

```typescript
const result = await gateway.request("our_pages.publish", {
  slug: "grafana",
  title: "Grafana",
  default_icon: "📈",
  type: "link",
  url: "http://localhost:3000",
  tags: ["monitoring"],
});
```

**Create a portal page:**

```typescript
const result = await gateway.request("our_pages.publish", {
  slug: "home-assistant",
  title: "Home Assistant",
  default_icon: "🏠",
  type: "portal",
  url: "http://homeassistant.local:8123",
});
```

**Update an existing page (reuse slug):**

```typescript
const result = await gateway.request("our_pages.publish", {
  slug: "server-monitor", // same slug as before
  title: "Server Monitor v2",
  type: "inline",
  html: "<html>...updated content...</html>",
});
// { id: "a1b2c3...", slug: "server-monitor", version: 2, updated_at: "2026-03-22T..." }
```

---

## `our_pages.list`

List pages with optional filtering, pagination, and sorting.

### Parameters

| Field             | Type      | Required | Description                                             |
| ----------------- | --------- | -------- | ------------------------------------------------------- |
| `tag`             | `string`  | No       | Filter pages that have this tag                         |
| `type`            | `string`  | No       | Filter by page type                                     |
| `search`          | `string`  | No       | Search in title and description (case-insensitive LIKE) |
| `pinned_only`     | `boolean` | No       | Only return pinned pages                                |
| `include_deleted` | `boolean` | No       | Include soft-deleted pages (default: `false`)           |
| `limit`           | `number`  | No       | Max results per page (default: 50, max: 200)            |
| `offset`          | `number`  | No       | Skip this many results for pagination (default: 0)      |

### Response

```typescript
{
  pages: OurPageRow[]  // array of page objects (see schema below)
  total: number        // total matching count (ignoring limit/offset)
}
```

### Sorting

Results are sorted by `pinned DESC, updated_at DESC` — pinned pages first, then most recently updated.

### Examples

**List all pages:**

```typescript
const result = await gateway.request("our_pages.list", {});
// { pages: [...], total: 12 }
```

**Filter by tag:**

```typescript
const result = await gateway.request("our_pages.list", {
  tag: "monitoring",
});
```

**Search by title or description:**

```typescript
const result = await gateway.request("our_pages.list", {
  search: "server",
});
```

**Paginate:**

```typescript
const page2 = await gateway.request("our_pages.list", {
  limit: 10,
  offset: 10,
});
```

**Combined filters:**

```typescript
const result = await gateway.request("our_pages.list", {
  tag: "ops",
  search: "monitor",
  pinned_only: true,
  limit: 5,
});
```

---

## `our_pages.get`

Fetch a single page by slug or ID.

### Parameters

| Field  | Type     | Required | Description |
| ------ | -------- | -------- | ----------- |
| `slug` | `string` | No\*     | Page slug   |
| `id`   | `string` | No\*     | Page UUID   |

\*One of `slug` or `id` is required. If neither is provided, an error is returned.

### Response

Returns the full `OurPageRow` object, or error if not found.

```typescript
{
  id: string
  slug: string
  title: string
  description: string | null
  default_icon: string
  type: "inline" | "link" | "file" | "portal" | "safe"
  html: string | null
  url: string | null
  path: string | null
  content_hash: string | null
  version: number
  source_skill: string | null
  source_session: string | null
  tags: string[]
  pinned: boolean
  visibility: "private" | "public"
  owner_id: string | null
  screenshot_path: string | null
  favicon: string | null
  sync_id: string | null
  node_origin: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}
```

### Examples

**Get by slug:**

```typescript
const page = await gateway.request("our_pages.get", {
  slug: "server-monitor",
});
```

**Get by ID:**

```typescript
const page = await gateway.request("our_pages.get", {
  id: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
});
```

---

## `our_pages.delete`

Soft-delete a page by setting its `deleted_at` timestamp. The page remains in the database for 30 days and can be restored. After 30 days, it is permanently purged on the next gateway startup.

### Parameters

| Field  | Type     | Required | Description         |
| ------ | -------- | -------- | ------------------- |
| `slug` | `string` | Yes      | Page slug to delete |

### Response

```typescript
{
  slug: string;
  deleted_at: string; // ISO 8601 timestamp
}
```

### Example

```typescript
const result = await gateway.request("our_pages.delete", {
  slug: "old-dashboard",
});
// { slug: "old-dashboard", deleted_at: "2026-03-22T10:30:00.000Z" }
```

---

## `our_pages.restore`

Restore a soft-deleted page by clearing its `deleted_at` timestamp.

### Parameters

| Field  | Type     | Required | Description          |
| ------ | -------- | -------- | -------------------- |
| `slug` | `string` | Yes      | Page slug to restore |

### Response

```typescript
{
  slug: string;
  restored: true;
}
```

### Example

```typescript
const result = await gateway.request("our_pages.restore", {
  slug: "old-dashboard",
});
// { slug: "old-dashboard", restored: true }
```

---

## `our_pages.pin`

Pin or unpin a page. Pinned pages appear first in listings and the Control UI grid.

### Parameters

| Field    | Type      | Required | Description                     |
| -------- | --------- | -------- | ------------------------------- |
| `slug`   | `string`  | Yes      | Page slug                       |
| `pinned` | `boolean` | Yes      | `true` to pin, `false` to unpin |

### Response

```typescript
{
  slug: string;
  pinned: boolean;
}
```

### Example

```typescript
// Pin a page
await gateway.request("our_pages.pin", {
  slug: "server-monitor",
  pinned: true,
});

// Unpin it
await gateway.request("our_pages.pin", {
  slug: "server-monitor",
  pinned: false,
});
```

---

## Database Schema

The `our_pages` table in `~/.openclaw/our-pages.db`:

| Column            | Type    | Default   | Description                                 |
| ----------------- | ------- | --------- | ------------------------------------------- |
| `id`              | TEXT    | UUID      | Primary key                                 |
| `slug`            | TEXT    | —         | Unique URL-safe identifier                  |
| `title`           | TEXT    | —         | Display title                               |
| `description`     | TEXT    | NULL      | Short description                           |
| `default_icon`    | TEXT    | `📄`      | Emoji icon                                  |
| `type`            | TEXT    | `inline`  | One of: inline, link, file, portal, safe    |
| `html`            | TEXT    | NULL      | Inline HTML content                         |
| `url`             | TEXT    | NULL      | URL for link/portal types                   |
| `path`            | TEXT    | NULL      | Filesystem path for file type               |
| `content_hash`    | TEXT    | NULL      | SHA-256 hash (first 16 hex chars) for dedup |
| `version`         | INTEGER | 1         | Increments on content change                |
| `source_skill`    | TEXT    | NULL      | Originating skill name                      |
| `source_session`  | TEXT    | NULL      | Originating session ID                      |
| `tags`            | TEXT    | NULL      | JSON-serialized string array                |
| `pinned`          | INTEGER | 0         | Boolean (0 or 1)                            |
| `visibility`      | TEXT    | `private` | `private` or `public` (not enforced yet)    |
| `owner_id`        | TEXT    | NULL      | Reserved for future use                     |
| `screenshot_path` | TEXT    | NULL      | Reserved for future use                     |
| `favicon`         | TEXT    | NULL      | Favicon URL or data URI                     |
| `sync_id`         | TEXT    | NULL      | Reserved for multi-node sync                |
| `node_origin`     | TEXT    | NULL      | Reserved for multi-node sync                |
| `deleted_at`      | TEXT    | NULL      | ISO timestamp when soft-deleted             |
| `created_at`      | TEXT    | —         | ISO timestamp of creation                   |
| `updated_at`      | TEXT    | —         | ISO timestamp of last update                |

### Indexes

| Name                    | Columns      | Type   |
| ----------------------- | ------------ | ------ |
| `idx_our_pages_slug`    | `slug`       | UNIQUE |
| `idx_our_pages_updated` | `updated_at` | INDEX  |
| `idx_our_pages_deleted` | `deleted_at` | INDEX  |
| `idx_our_pages_type`    | `type`       | INDEX  |
| `idx_our_pages_owner`   | `owner_id`   | INDEX  |
| `idx_our_pages_sync`    | `sync_id`    | INDEX  |

### SQLite Configuration

- `PRAGMA busy_timeout = 5000` — Wait up to 5 seconds for locks
- `PRAGMA journal_mode = WAL` — Write-Ahead Logging for concurrent reads

---

## Agent Tool Mapping

The RPC methods map to agent tools as follows:

| RPC Method          | Agent Tool          | Available In       |
| ------------------- | ------------------- | ------------------ |
| `our_pages.list`    | `our_pages_list`    | enabled, read-only |
| `our_pages.get`     | `our_pages_get`     | enabled, read-only |
| `our_pages.publish` | `our_pages_publish` | enabled            |
| `our_pages.delete`  | `our_pages_delete`  | enabled            |
| `our_pages.status`  | (no agent tool)     | RPC only           |
| `our_pages.restore` | (no agent tool)     | RPC only           |
| `our_pages.pin`     | (no agent tool)     | RPC only           |

The `our_pages_publish` agent tool enforces the slug pattern `^[a-z0-9-]+$` in its schema, and exposes the `type` field as a string enum of `inline | link | file | portal`.
