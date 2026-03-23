## [Feature] Auto-publish onboarding page on first run

**Branch:** feat/our-pages

### Problem

New users who receive the Our Pages feature update have no way to discover what it is or how to use it. The agent doesn't know to use it without explicit instruction.

### Proposed Solution

When Our Pages is first enabled and the database is empty, auto-publish a built-in "Getting Started" page at slug `getting-started`.

**Content for humans:**

- What Our Pages is and why it exists
- How to ask the agent to publish things

**Content for agents:**

- Reinforces the `our_pages_publish` tool as the canonical publishing surface
- Example prompts:
  - "Show me what services you have running and create a status page"
  - "Audit what I've built and migrate it to Our Pages"
  - "Create a dashboard for..."

### Implementation

- `src/gateway/our-pages-db.ts` — add `seedDefaultPages()` on init
- `src/gateway/our-pages-defaults.ts` — built-in HTML template (new file)
- `src/gateway/server-methods/our-pages.ts` — call seed on startup if DB empty

### Notes

- Slug `getting-started` should be soft-protected (warn before delete, don't hard-block)
- Template HTML should be self-contained, no external fetches
- Should work on first run of any OpenClaw instance, not just remote/VPS configs
