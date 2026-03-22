# Our Pages Manager

Save pages, dashboards, and tools to the user's Our Pages tab using `our_pages_publish`.

## When to PUBLISH

- Monitoring dashboards (server, node, network)
- Data trackers (bills, crypto, property, inventory)
- Interactive tools (calculators, configurators, converters)
- Reference pages (cheat sheets, runbooks, lookup tables)
- Links to local services the agent has set up
- Portal views of external dashboards (Home Assistant, Grafana, etc.)

## When NOT to publish

- One-off chat explanations
- Temporary visualizations for a single question
- Content the user hasn't seen yet — show on Canvas first, then offer to save
- Duplicate content — always check existing pages first

When in doubt: ask "Would you like me to save this to Our Pages?"

## Choosing the Right Page Type

### `inline` (default)

Self-contained HTML stored in the database. Best for dashboards, reports, calculators, and reference pages that run purely client-side.

Use when: the content is HTML you can generate in full, with no backend dependency.

### `link`

A redirect to a URL. Best for local services running on localhost or the LAN.

Use when: the agent has started or discovered a service the user wants quick access to. Our Pages acts as a launchpad — it does not manage the service.

### `file`

A pointer to a file on disk. Best for living documents like runbooks or markdown notes.

Use when: the content is a file that gets edited directly, not rebuilt by the agent each time.

### `portal`

A full-page iframe wrapper with a header bar. Best for external dashboards or apps that the user wants to view inside the Our Pages UI without leaving the tab.

Use when: the target URL allows iframing and the user wants an integrated view rather than a redirect. Portal pages have a styled header with the page title, icon, and an "Open in new tab" button.

**Do not use portal for:** sites that block iframes (X-Frame-Options: DENY), login pages that need cookies from the parent origin, or sites with restrictive CSP `frame-ancestors`.

## Workflow

1. **Always call `our_pages_list` first.** Check for existing slugs to avoid duplicates. If a page with the same purpose exists, reuse its slug to update it.
2. **Reuse slugs to update.** Publishing to an existing slug updates the page in place and increments the version (only if content actually changed).
3. **For inline pages:** provide complete, self-contained HTML with dark theme, responsive layout, and no outbound fetch. External CDN libraries from cdnjs.cloudflare.com and cdn.jsdelivr.net are allowed by CSP.
4. **For linked services:** use `type: "link"` with `url: "http://localhost:PORT"`.
5. **For portal views:** use `type: "portal"` with the full URL. The gateway wraps it in an iframe with a header bar automatically.

## Slug Naming Best Practices

- **Use kebab-case:** `server-monitor`, not `serverMonitor` or `server_monitor`
- **Be descriptive:** `cpu-usage-dashboard` not `dashboard1`
- **Be stable:** use the same slug for the same concept so updates replace rather than duplicate
- **Keep it short but clear:** `vim-cheatsheet`, `bill-tracker`, `grafana`
- **Pattern: `^[a-z0-9-]+$`** — only lowercase letters, digits, and hyphens

**Good slugs:** `server-monitor`, `vim-cheatsheet`, `bill-tracker-2024`, `home-assistant`, `grafana`
**Bad slugs:** `Dashboard1`, `my_page`, `untitled`, `test`, `page`

## Naming Guidelines

- **title:** Short noun-phrase — `"Server Monitor"`, `"Vim Cheat Sheet"`
- **default_icon:** Single emoji that represents the content — `📊`, `⌨️`, `📈`
- **description:** One sentence explaining what the page does (shown on the card)
- **tags:** Array of category strings for filtering — `["monitoring", "infra"]`

## Updating Existing Pages

To update a page, publish to the same slug with new content:

```
our_pages_publish({
  slug: "server-monitor",     // same slug
  title: "Server Monitor v2", // updated title is fine
  type: "inline",
  html: "...new content...",
})
```

- If the content hash is identical to the current version, it is a no-op (version does not change).
- If the content differs, the version increments automatically.
- Metadata (title, description, tags, icon) can be updated without changing the version.

## Iframe Limitations (in the viewer)

Pages run sandboxed in the Control UI viewer — no clipboard, no localStorage, no outbound fetch.
Design for sandbox first. Use "Open in new tab" for full capabilities.

```js
const inSandbox = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

if (inSandbox) {
  // Show "Open in new tab for full features" message
}
```

## Live Updates from a Page Button

```js
window.location.href = `openclaw://agent?message=${encodeURIComponent("Refresh server stats")}`;
```

Do NOT call Gateway RPC directly from page HTML. Use the `openclaw://agent` URL scheme to send a message to the agent, which can then update the page via `our_pages_publish`.

## Examples of Good Agent Behavior

### Creating a dashboard

1. Call `our_pages_list({ search: "monitor" })` to check for existing pages.
2. No existing page found — publish a new one:
   ```
   our_pages_publish({
     slug: "server-monitor",
     title: "Server Monitor",
     default_icon: "📊",
     type: "inline",
     html: "<!DOCTYPE html>...",
     tags: ["monitoring", "infra"]
   })
   ```
3. Tell the user: "Saved to Our Pages. You can find it in the Our Pages tab or at /ourpages/server-monitor"

### Registering a local service

1. Agent starts or discovers a service on localhost:8080.
2. Call `our_pages_list({ tag: "services" })` to check for existing entries.
3. Publish a link:
   ```
   our_pages_publish({
     slug: "dev-server",
     title: "Dev Server",
     default_icon: "🚀",
     type: "link",
     url: "http://localhost:8080",
     tags: ["services", "dev"]
   })
   ```

### Embedding an external dashboard

1. User asks to add their Home Assistant dashboard.
2. Publish a portal:
   ```
   our_pages_publish({
     slug: "home-assistant",
     title: "Home Assistant",
     default_icon: "🏠",
     type: "portal",
     url: "http://homeassistant.local:8123",
     tags: ["smart-home"]
   })
   ```
3. The user sees it as a full-page iframe with a header bar in the Our Pages viewer.

### Updating content

1. User asks to refresh the server monitor.
2. Call `our_pages_list({ search: "server-monitor" })` — found existing at version 3.
3. Publish updated content to the same slug:
   ```
   our_pages_publish({
     slug: "server-monitor",
     title: "Server Monitor",
     default_icon: "📊",
     type: "inline",
     html: "<!DOCTYPE html>...updated...",
     tags: ["monitoring", "infra"]
   })
   ```
4. Version becomes 4 automatically.
