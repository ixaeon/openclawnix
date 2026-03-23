## [Feature] Gateway API proxy at /ourpages-api/

**Branch:** feat/our-pages

### Problem

Inline Our Pages content cannot `fetch()` data from other ports running on the same machine. The browser blocks these as cross-origin requests (CORS). This forces agents to either:

1. Publish stale static data (no live updates)
2. Use `type='link'` pages that just redirect to port URLs (not real Our Pages)

This affects all deployment configurations but is especially painful for remote/VPS setups where the user cannot reach ports directly.

### Proposed Solution

Add a proxy route at `/ourpages-api/<slug>` in the gateway HTTP server. Configured local URLs are accessible via this proxy without CORS issues.

**Example:**

```
GET /ourpages-api/health
→ gateway forwards to → http://localhost:8082/api/health
→ returns response to browser (same origin, no CORS)
```

**Configuration:**

```json
{
  "ourPages": {
    "apiProxy": {
      "health": "http://localhost:8082/api/health"
    }
  }
}
```

**Agent tool:**

```
our_pages_register_api(slug, url)
```

Registers a localhost URL under `/ourpages-api/<slug>`. Inline pages can then use relative URLs.

### Security Constraints

- Only forwards to explicitly configured localhost/loopback URLs
- No arbitrary URL forwarding (reject anything not in config)
- No auth header forwarding by default

### Implementation

- `src/gateway/server-http.ts` — add `/ourpages-api/` route
- `src/gateway/our-pages-proxy.ts` — proxy logic (new file)
- `src/config/types.gateway.ts` — `ourPages.apiProxy` schema
- `src/agents/tools/our-pages-tool.ts` — add `our_pages_register_api` tool

### Why This Matters

Without this, Our Pages is a static publishing surface. With it, agents can build genuinely interactive dashboards that work on localhost, Tailscale, and reverse-proxy configs equally.
