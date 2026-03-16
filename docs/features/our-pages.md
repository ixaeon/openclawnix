# Our Pages

Our Pages is a persistent tab in the OpenClaw Control UI where your agent saves the dashboards, tools, and reference pages it builds for you. Instead of rebuilding things from scratch every session, the agent accumulates a growing library of useful artifacts — and you always know where to find them.

---

## What It Is

When your agent creates something useful — a server monitor, a bill tracker, a cheat sheet — it can save it to Our Pages with a single tool call. The page gets a URL, a version number, and shows up in the Our Pages tab immediately.

The name reflects the collaboration: the user asks, the agent builds, both use it. It's a shared space that belongs to neither party alone.

---

## How It Works

Pages are stored in SQLite alongside the rest of the gateway state. They're served by the Canvas server and rendered in a sandboxed iframe in the Control UI. Each page has:

- A **slug** — the URL-safe identifier (`server-monitor`, `bill-tracker`)
- A **type** — `inline` (self-contained HTML), `link` (local service), `file` (filesystem path)
- A **version** — incremented on every content change, no-op if content is identical
- **Tags** for filtering, a **pin** state, and soft-delete with 30-day recovery

---

## Quick Start: Your First Page

Ask your agent:

> "Save a hello world page to Our Pages"

The agent will call `our_pages_publish` with something like:

```json
{
  "slug": "hello-world",
  "title": "Hello World",
  "default_icon": "👋",
  "type": "inline",
  "html": "<!DOCTYPE html><html>..."
}
```

The page immediately appears in the Our Pages tab. Click it to open the sandboxed viewer, or use "Open in new tab" for full browser capabilities.

---

## Configuration

```json
{
  "ourPages": {
    "mode": "enabled"
  }
}
```

| Mode                | Tab | Agent tools                | Publishing |
| ------------------- | --- | -------------------------- | ---------- |
| `enabled` (default) | ✅  | publish, list, get, delete | ✅         |
| `read-only`         | ✅  | list, get only             | ❌         |
| `disabled`          | ❌  | none                       | ❌         |

---

## CLI

```bash
openclaw our-pages list
openclaw our-pages list --tag monitoring
openclaw our-pages info <slug>
openclaw our-pages delete <slug>
openclaw our-pages restore <slug>
openclaw our-pages status
```

---

## Agent Tools

Three tools are available to the agent when mode is `enabled`:

**`our_pages_publish`** — Create or update a page. Reusing the same slug updates the existing page and increments its version.

**`our_pages_list`** — List existing pages. The agent calls this before publishing to avoid duplicates.

**`our_pages_delete`** — Soft-delete a page (30-day recovery window).

In `read-only` mode, only `our_pages_list` and `our_pages_get` are registered.

---

## Content Types

### Inline HTML (`type: "inline"`)

Self-contained HTML stored in SQLite. The default. Works great for dashboards, reports, calculators, cheat sheets — anything that runs client-side. External CDN libraries (Chart.js, D3, etc.) are fine.

### Linked Service (`type: "link"`)

A catalog entry pointing to a local URL (`http://localhost:PORT`). Our Pages stores the metadata and acts as a launchpad — it doesn't manage the service itself.

### File-Backed (`type: "file"`)

Points to a file on disk. Useful for living documents (runbooks, markdown notes) that get updated by editing the file directly.

### Safe (`type: "safe"`)

System-only. Rendered when content type is unrecognized, validation fails, or a page is flagged. Shows a static "unavailable" message. Cannot be created by agents directly.

---

## Security

Pages are served from the **Canvas server** (separate port from the gateway). A page opened in a new tab cannot access gateway credentials — different origins, different cookies.

In the viewer, pages run in a **sandboxed iframe** (`sandbox="allow-scripts allow-forms"` — no `allow-same-origin`). This means:

- No clipboard API (use "Open in new tab" for copy buttons)
- No localStorage / IndexedDB
- No outbound fetch/XHR
- No window.alert / confirm

The "Open in new tab" button gives full browser capabilities while keeping the page on the canvas server origin (not the gateway).

---

## Iframe Sandbox Detection

If you're writing an inline page and want to behave differently in the viewer vs. a new tab:

```js
const inSandbox = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
```

---

## Size Limits

| Limit      | Value | Behavior                 |
| ---------- | ----- | ------------------------ |
| Soft limit | 5 MB  | Logs a warning, proceeds |
| Hard limit | 15 MB | Rejects with error       |

For large content, use `type: "file"` (filesystem) or `type: "link"` (service on its own port).

---

## Versioning and Deduplication

Publishing the same content twice (identical HTML) does **not** increment the version. The content hash is compared — if it matches, the call is a no-op. This prevents pointless version inflation when the agent re-publishes unchanged content.

---

## Backup

Our Pages data lives in the gateway SQLite database alongside all other gateway state. It's included in any standard gateway backup:

```bash
# Live backup (gateway running)
sqlite3 ~/.openclaw/gateway.db ".backup '/backup/gateway.db'"
```

On machine migration, copy `~/.openclaw/` and everything comes with it.

---

## Soft Delete and Recovery

Deleting a page sets `deleted_at` — it stays in the database for 30 days. During that window:

```bash
openclaw our-pages restore <slug>
```

After 30 days, the row is permanently purged on the next gateway startup.
