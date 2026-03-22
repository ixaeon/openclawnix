# Our Pages

Our Pages is a persistent tab in the OpenClaw Control UI where your agent saves the dashboards, tools, and reference pages it builds for you. Instead of rebuilding things from scratch every session, the agent accumulates a growing library of useful artifacts — and you always know where to find them.

The name reflects the collaboration: the user asks, the agent builds, both use it. It is a shared space that belongs to neither party alone.

---

## Quick Start

Ask your agent:

> "Save a hello world page to Our Pages"

The agent calls `our_pages_publish` with something like:

```json
{
  "slug": "hello-world",
  "title": "Hello World",
  "default_icon": "👋",
  "type": "inline",
  "html": "<!DOCTYPE html><html><body><h1>Hello World</h1></body></html>"
}
```

The page immediately appears in the Our Pages tab. Click it to open the sandboxed viewer, or use "Open in new tab" for full browser capabilities. It is now accessible at `/ourpages/hello-world` on your canvas server.

---

## How Agents Publish Pages

When the agent has something worth keeping — a dashboard, a cheat sheet, a link to a local service — it calls the `our_pages_publish` tool. The agent should:

1. **Call `our_pages_list` first** to check for existing slugs and avoid duplicates.
2. **Reuse the same slug** to update an existing page. The version increments automatically when content changes.
3. **Pick the right page type** for the content (see below).
4. **Choose a descriptive slug** in kebab-case: `server-monitor`, not `dashboard1`.

The agent can also delete pages with `our_pages_delete` (soft-delete with 30-day recovery) and query individual pages with `our_pages_get`.

In `read-only` mode, only `our_pages_list` and `our_pages_get` are available. In `disabled` mode, no tools are registered at all.

---

## Page Types

Our Pages supports four content types, each suited to different use cases.

### Inline (`type: "inline"`)

Self-contained HTML stored directly in the database. This is the default type and the most common. Use it for dashboards, reports, calculators, cheat sheets — anything that runs client-side without a backend.

**Requirements:**

- The `html` field must contain a complete HTML document.
- External CDN libraries (Chart.js, D3, Leaflet, etc.) are allowed via the Content Security Policy.
- No outbound `fetch` or `XMLHttpRequest` from the sandboxed viewer (use "Open in new tab" for that).
- Dark theme and responsive design are recommended for consistency with the Control UI.

**Example:**

```json
{
  "slug": "cpu-dashboard",
  "title": "CPU Dashboard",
  "default_icon": "📊",
  "type": "inline",
  "html": "<!DOCTYPE html><html>...</html>",
  "tags": ["monitoring", "infra"]
}
```

### Link (`type: "link"`)

A catalog entry pointing to an external or local URL. When a user clicks the page card, the browser redirects (HTTP 302) to the URL. Our Pages stores the metadata and acts as a launchpad — it does not proxy or manage the service itself.

**Requirements:**

- The `url` field must contain the target URL (e.g. `http://localhost:3000`).
- The `html` field is not used.

**Example:**

```json
{
  "slug": "grafana",
  "title": "Grafana",
  "default_icon": "📈",
  "type": "link",
  "url": "http://localhost:3000",
  "description": "Local Grafana dashboards",
  "tags": ["monitoring", "metrics"]
}
```

### File (`type: "file"`)

Points to a file on the local filesystem. Useful for living documents (runbooks, markdown notes) that are updated by editing the file directly rather than republishing HTML.

**Requirements:**

- The `path` field must contain an absolute filesystem path.
- The file is not served via HTTP directly in the current implementation; it is a metadata pointer that the Control UI can use to open or display the file.

**Example:**

```json
{
  "slug": "ops-runbook",
  "title": "Operations Runbook",
  "default_icon": "📝",
  "type": "file",
  "path": "/home/user/docs/runbook.md"
}
```

### Portal (`type: "portal"`)

Embeds an external URL in a full-page iframe with a styled header bar showing the page title, icon, and an "Open in new tab" button. Unlike `link` (which redirects), `portal` keeps the user inside the Our Pages UI while displaying the external content.

The Content Security Policy for portal pages is more permissive: `frame-src *` allows iframing any origin, while `frame-ancestors 'self'` prevents the portal page itself from being embedded elsewhere.

**Requirements:**

- The `url` field must contain the target URL.
- The target URL must allow being framed (no `X-Frame-Options: DENY` or restrictive `frame-ancestors`).

**Example:**

```json
{
  "slug": "home-assistant",
  "title": "Home Assistant",
  "default_icon": "🏠",
  "type": "portal",
  "url": "http://homeassistant.local:8123",
  "description": "Smart home dashboard"
}
```

### Safe (`type: "safe"`)

System-only. This type is automatically assigned when an agent passes an unrecognized type string. It renders a static "not supported" message (HTTP 501) and cannot be created explicitly — calling `our_pages_publish` with `type: "safe"` throws an error.

---

## URL Structure

Pages are served by the canvas HTTP server at:

```
http://<canvas-host>:<canvas-port>/ourpages/<slug>
```

For example, a page with slug `server-monitor` is accessible at `/ourpages/server-monitor`.

**Legacy path redirect:** The original path `/__openclaw__/our-pages/<slug>` is permanently redirected (HTTP 301) to `/ourpages/<slug>`.

**Slug format:** Lowercase alphanumeric characters and hyphens only, matching the pattern `^[a-z0-9-]+$`. Examples: `server-monitor`, `vim-cheatsheet`, `bill-tracker-2024`.

**Behavior by type:**

| Type     | HTTP Response                        |
| -------- | ------------------------------------ |
| `inline` | 200 with `text/html` body            |
| `link`   | 302 redirect to the stored URL       |
| `portal` | 200 with iframe wrapper HTML         |
| `file`   | (metadata only, not served via HTTP) |
| `safe`   | 501 "Page type not supported"        |

---

## Configuration

Our Pages configuration lives under the `ourPages` key in your gateway config (`~/.openclaw/config.json` or via `openclaw config set`):

```json
{
  "ourPages": {
    "mode": "enabled",
    "basePath": "/ourpages"
  }
}
```

### `ourPages.mode`

Controls whether Our Pages is active and what operations are allowed.

| Mode                | Our Pages tab | Agent read tools | Agent write tools | HTTP serving |
| ------------------- | ------------- | ---------------- | ----------------- | ------------ |
| `enabled` (default) | Visible       | list, get        | publish, delete   | Active       |
| `read-only`         | Visible       | list, get        | None              | Active       |
| `disabled`          | Hidden        | None             | None              | Inactive     |

Set via CLI:

```bash
openclaw config set ourPages.mode read-only
openclaw config set ourPages.mode enabled
```

### `ourPages.basePath`

The URL prefix where pages are served. Defaults to `/ourpages`. Must start with `/` and contain only alphanumeric characters, underscores, or hyphens.

```bash
openclaw config set ourPages.basePath /pages
```

After changing, pages are served at `/pages/<slug>` instead of `/ourpages/<slug>`. The legacy `/__openclaw__/our-pages/*` redirect updates automatically.

---

## CLI Commands

The `openclaw our-pages` command group provides direct management of pages without going through the Control UI.

### `openclaw our-pages list`

List all live pages in a table format showing slug, title, type, and version.

```bash
openclaw our-pages list
openclaw our-pages list --tag monitoring
openclaw our-pages list --type inline
openclaw our-pages list --include-deleted
```

**Flags:**

- `--tag <tag>` — Filter pages that have the specified tag.
- `--type <type>` — Filter by page type (`inline`, `link`, `file`, `portal`).
- `--include-deleted` — Include soft-deleted pages in the results.

### `openclaw our-pages info <slug>`

Display full details for a single page as JSON, including all metadata, tags, version, timestamps, and content hash.

```bash
openclaw our-pages info server-monitor
```

### `openclaw our-pages delete <slug>`

Soft-delete a page. The page remains in the database for 30 days and can be restored.

```bash
openclaw our-pages delete old-dashboard
# Output: Moved to trash: old-dashboard (deleted_at: 2026-03-22T10:30:00.000Z)
```

### `openclaw our-pages restore <slug>`

Restore a previously soft-deleted page within the 30-day recovery window.

```bash
openclaw our-pages restore old-dashboard
# Output: Restored: old-dashboard
```

### `openclaw our-pages status`

Show the current Our Pages mode and count of live (non-deleted) pages.

```bash
openclaw our-pages status
# Output:
# Mode: enabled
# Pages: 12
```

---

## Security Model

Our Pages uses a layered security approach designed to keep published content accessible without exposing gateway internals.

### No Canvas Capability Token Required

Pages served at `/ourpages/*` are treated as published content. The HTTP handler runs **before** the canvas authentication middleware, so no canvas capability token is needed to view a page. This is intentional: pages are meant to be easily accessible to any authenticated gateway user (via Tailscale, token auth, etc.).

### Origin Isolation

Pages are served from the **canvas server**, which runs on a separate port from the gateway API. A page opened in a browser tab has a different origin than the gateway, so it cannot access gateway cookies, credentials, or API endpoints via same-origin requests.

### Sandboxed Iframe Viewer

In the Control UI, pages are rendered inside a sandboxed iframe with `sandbox="allow-scripts allow-forms"` (no `allow-same-origin`). This means:

- No access to the clipboard API (Clipboard.writeText fails)
- No localStorage or IndexedDB
- No outbound fetch or XMLHttpRequest
- No `window.alert()`, `window.confirm()`, or `window.prompt()`
- No access to the parent frame's DOM or JavaScript context

The "Open in new tab" button gives full browser capabilities while keeping the page on the canvas server origin.

### Content Security Policy

All page responses include security headers:

```
Content-Security-Policy:
  default-src 'self' 'unsafe-inline';
  script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net;
  connect-src 'self';
  frame-ancestors 'self'

X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Portal pages have a more permissive CSP that adds `frame-src *` to allow embedding external origins in the iframe.

### Sandbox Detection

Inline pages can detect whether they are running in the sandboxed viewer or in a full browser tab:

```js
const inSandbox = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
```

Use this to show a "For full features, open in a new tab" message when clipboard or fetch is needed.

---

## Versioning and Deduplication

Every page has a `version` number starting at 1. The version increments each time the page content changes — specifically, when the SHA-256 content hash differs from the stored hash.

**No-op updates:** Publishing identical content (same HTML, URL, or path) to an existing slug does **not** increment the version. The content hash is compared, and if it matches, the publish call returns immediately with the existing version. This prevents pointless version inflation when an agent re-publishes unchanged content.

**What counts as content:** The hash is computed over the `html`, `url`, or `path` field (whichever is populated). Metadata changes (title, description, icon, tags) without a content change still trigger a database update but do not bump the version.

---

## Size Limits

Inline HTML content is subject to size limits to keep the SQLite database healthy:

| Limit      | Value | Behavior                              |
| ---------- | ----- | ------------------------------------- |
| Soft limit | 5 MB  | Logs a warning, proceeds with publish |
| Hard limit | 15 MB | Rejects the publish with an error     |

For large content, use `type: "file"` to point to a file on disk, or `type: "link"` to redirect to a service running on its own port.

---

## Backup and Restore

Our Pages data lives in its own SQLite database at `~/.openclaw/our-pages.db`. This file uses WAL (Write-Ahead Logging) mode for concurrent read safety.

### Backing Up

```bash
# Safe live backup (works while the gateway is running)
sqlite3 ~/.openclaw/our-pages.db ".backup '/backup/our-pages.db'"

# Or simply copy the file when the gateway is stopped
cp ~/.openclaw/our-pages.db /backup/our-pages.db
```

### Restoring

```bash
# Stop the gateway first
cp /backup/our-pages.db ~/.openclaw/our-pages.db
# Restart the gateway
```

### Machine Migration

Copy the entire `~/.openclaw/` directory to the new machine. The `our-pages.db` file comes along with everything else.

---

## Soft Delete and Recovery

When you delete a page (via CLI or agent tool), it is **soft-deleted**: the `deleted_at` timestamp is set, but the row stays in the database.

- Soft-deleted pages do not appear in listings by default (pass `--include-deleted` or `include_deleted: true` to see them).
- Soft-deleted pages return HTTP 404 when accessed via their URL.
- Soft-deleted pages can be restored within 30 days.

**Recovery:**

```bash
openclaw our-pages restore <slug>
```

**Permanent purge:** Rows with `deleted_at` older than 30 days are automatically and permanently purged on every gateway startup. There is no recovery after purge.

**Re-publish restores:** Publishing to a slug that was previously soft-deleted automatically clears `deleted_at`, effectively restoring the page with new content.

---

## Tags and Filtering

Pages can have an array of string tags for organization and filtering:

```json
{
  "slug": "server-monitor",
  "title": "Server Monitor",
  "tags": ["monitoring", "infra", "ops"]
}
```

Tags are used for:

- **CLI filtering:** `openclaw our-pages list --tag monitoring`
- **Control UI filtering:** Click a tag chip to filter the grid
- **Agent queries:** `our_pages_list({ tag: "monitoring" })`

Tags are stored as a JSON array in SQLite and matched using a LIKE query, so partial tag names may match. Use distinct, specific tag names.

---

## Pinning

Pages can be pinned to appear first in listings and the Control UI grid. Pin and unpin via the RPC method `our_pages.pin`:

```bash
# Via the Control UI: click the pin icon on any page card
# Via RPC: our_pages.pin({ slug: "server-monitor", pinned: true })
```

Pinned pages are sorted before unpinned pages, then by last-updated time within each group.

---

## Known Limitations

1. **File type not served via HTTP.** The `file` type stores a filesystem path as metadata but does not serve the file content over HTTP. It is a pointer for the Control UI or CLI to use.

2. **Sandbox restricts clipboard and network.** Inline pages in the sandboxed viewer cannot use the Clipboard API, fetch, or localStorage. Use "Open in new tab" for full capabilities.

3. **Portal pages depend on the target allowing iframes.** If the target URL sends `X-Frame-Options: DENY` or a restrictive `Content-Security-Policy`, the portal iframe will be blocked by the browser.

4. **Tag matching is substring-based.** The tag filter uses SQL LIKE, so a tag `"ops"` would also match `"devops"` if present. Use distinct tag names to avoid unintended matches.

5. **No real-time updates in the viewer.** The viewer loads the page content once. To see changes after a re-publish, refresh the page or re-open it.

6. **Single-node only.** Our Pages data lives in a local SQLite database. There is no multi-node sync or replication (the `sync_id` and `node_origin` fields are reserved for future use).

7. **No access control per page.** All pages share the same visibility within the gateway. The `visibility` and `owner_id` fields exist in the schema but are not enforced in the current implementation.
