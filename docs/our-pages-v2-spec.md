# Our Pages v2 — Feature Spec

_Branch: feat/our-pages | Author: Nix ⚡ | Date: 2026-03-23_

## Problem Statement

Our Pages ships as a publishing surface, but three structural gaps prevent it from being the _primary_ UI layer for things agents build:

1. **No onboarding** — new users don't know it exists or what it's for
2. **No same-origin API access** — inline pages can't `fetch()` live data from other ports (CORS blocks cross-origin requests), forcing agents to either use stale static data or publish `link` type pages that just redirect to port URLs
3. **No service discovery** — there's no mechanism to find what an agent has already built and help migrate it to Our Pages

These gaps mean agents continue building parallel UIs outside Our Pages (dashboards on port :8444, apps on :8447, etc.), defeating the purpose of the feature.

---

## Deployment Scenarios

Our Pages must work well across all three common OpenClaw deployment patterns:

### A. Local install (same machine)

- Gateway on `localhost:18789`, browser has direct port access
- User is technical, may be comfortable with port URLs
- Needs: discovery + onboarding; CORS less critical since same machine

### B. Remote/VPS (Tailscale or reverse proxy)

- Gateway behind a proxy, ports not directly browseable
- Our Pages is the _only_ navigable surface without port knowledge
- Needs: CORS proxy essential; inline pages must work without port URLs

### C. GUI-first user (desktop app)

- Gateway embedded in an app, no terminal
- User expects a single unified UI surface
- Needs: Our Pages as primary UI, smooth onboarding, no manual port management

---

## Proposed Features

### Feature 1: Onboarding Page (auto-published on first run)

**What:** When Our Pages is first enabled (no pages exist), the gateway auto-publishes a built-in "Getting Started" page at slug `getting-started`.

**Content:**

- What Our Pages is (for the human): a place to access everything the agent builds
- What Our Pages is (for the agent): the canonical publishing surface, not a file on disk
- Example prompts that trigger useful agent behavior:
  - "Show me what services you have running and publish a status page"
  - "I want to see my agent's recent activity"
  - "Create a dashboard for [whatever the user's use case is]"
- A checklist of common things to publish (status page, inventory, reports)

**Implementation:**

- Built-in HTML template in the source (not fetched externally)
- Published on first `listPages()` call that returns empty, or on gateway start if `ourPages.mode === "enabled"` and DB is empty
- Slug `getting-started` is reserved; agent cannot delete it (soft-protected)
- Can be overwritten by the agent to customize for the specific deployment

**Files to change:**

- `src/gateway/our-pages-db.ts` — add `seedDefaultPages()` called on init
- `src/gateway/server-methods/our-pages.ts` — call seed on startup
- New file: `src/gateway/our-pages-defaults.ts` — built-in page templates

---

### Feature 2: Gateway API Proxy (`/ourpages-api/`)

**What:** The gateway exposes a proxy route at `/ourpages-api/<path>` that forwards requests to configured internal services. Inline Our Pages content can fetch from `/ourpages-api/...` without CORS issues, regardless of deployment topology.

**Why this works:**

- Browser fetches `/ourpages-api/health` → same origin as the page → no CORS
- Gateway receives it → forwards to configured backend → returns response
- Works on localhost, Tailscale, reverse proxy — topology is transparent to the page

**Configuration:**

```json
{
  "ourPages": {
    "apiProxy": {
      "health": "http://localhost:8082/api/health",
      "inventory": "http://localhost:8082/api/vm-inventory",
      "guardian": "http://localhost:8082/api/guardian-status"
    }
  }
}
```

Or auto-discovered if the agent registers services (see Feature 3).

**Security:**

- Proxy only forwards to explicitly configured localhost endpoints — no arbitrary URL forwarding
- Requests to external URLs rejected with 403
- No auth headers forwarded by default (configurable)

**Implementation:**

- `src/gateway/server-http.ts` — add `/ourpages-api/` route handler
- `src/config/types.gateway.ts` — add `ourPages.apiProxy` config schema
- New file: `src/gateway/our-pages-proxy.ts` — proxy logic

**Agent tool addition:**

```typescript
our_pages_register_api(slug: string, url: string)
// Registers a local URL under /ourpages-api/<slug>
// Stored in our-pages DB alongside page records
// Agent calls this when starting a service that inline pages will need
```

---

### Feature 3: Service Discovery + Migration Wizard

**What:** A built-in audit tool that finds services/pages built outside Our Pages and offers to migrate them.

**Triggered by:**

- Agent prompt: "audit my services" / "what have I built?" / "migrate to Our Pages"
- Heartbeat check (optional, configurable)
- Manual: `openclaw pages audit`

**Discovery sources:**

- Listening ports (`ss -tlnp`) → check against known service signatures
- HTML files in workspace directories → offer to publish inline
- Services registered in systemd user units → check if they have a web interface
- `/ourpages-api/` registrations → already known
- Existing `link` type pages → flag as candidates for inline migration

**Output format (to agent):**

```json
{
  "unpublished_services": [
    {
      "name": "dashboard",
      "url": "http://localhost:8082",
      "suggested_slug": "dashboard",
      "type": "link"
    },
    {
      "name": "lexos",
      "url": "http://localhost:8447",
      "suggested_slug": "lexos-app",
      "type": "link"
    }
  ],
  "publishable_html": [
    {
      "path": "/home/project/dashboard/revenue.html",
      "suggested_slug": "revenue",
      "type": "inline"
    }
  ],
  "link_type_candidates_for_inline": [
    {
      "slug": "nix-blog",
      "current_url": "http://localhost:8444/blog.html",
      "reason": "port redirect, could be inline"
    }
  ]
}
```

Agent presents this as a checklist to the human, confirms before acting.

**Implementation:**

- New agent tool: `our_pages_audit()` → returns discovery JSON
- New file: `src/agents/tools/our-pages-audit.ts`
- `src/gateway/server-methods/our-pages.ts` — add `/our-pages/audit` endpoint

---

### Feature 4: System Prompt Fragment (auto-injected when enabled)

**What:** When Our Pages is enabled, the gateway injects a short instruction into every agent session's system context.

**Text:**

```
Our Pages is enabled. When you build any HTML page, dashboard, report, or tool,
publish it with `our_pages_publish` (type='inline' for HTML content).
This keeps everything discoverable in one place and works across all deployment
configurations. Do not deliver HTML by writing files to disk.
```

**Why in source, not in AGENTS.md:**

- Works for every OpenClaw deployment, not just ours
- Doesn't require per-deployment configuration files
- Scales to new users who don't know to add it to their config

**Implementation:**

- `src/context-engine/` or equivalent system prompt assembly location
- Only injected if `ourPages.mode !== "disabled"`
- Configurable: `ourPages.injectSystemPrompt: true` (default true)

---

## Non-Goals for v2

- Public/shareable Our Pages (authentication scoping is out of scope)
- Real-time push updates to inline pages (WebSocket proxying deferred)
- Automatic port discovery without explicit configuration (security risk)

---

## Issue Tracking

See companion GitHub issues filed against `feat/our-pages`:

- Issue #1: Onboarding page (auto-seed on first run)
- Issue #2: Gateway API proxy (`/ourpages-api/`)
- Issue #3: Service discovery + migration wizard
- Issue #4: System prompt fragment (auto-inject)

---

## Implementation Priority

| Priority | Feature                            | Complexity | Impact                                         |
| -------- | ---------------------------------- | ---------- | ---------------------------------------------- |
| P0       | System prompt fragment (Feature 4) | Low        | High — fixes agent behavior immediately        |
| P1       | Gateway API proxy (Feature 2)      | Medium     | High — fixes CORS, enables live inline pages   |
| P2       | Onboarding page (Feature 1)        | Low        | Medium — discovery for new users               |
| P3       | Service discovery (Feature 3)      | High       | Medium — nice-to-have for existing deployments |

P0 and P1 are the meaningful contributions for the initial PR. P2 adds polish. P3 is a follow-up.
