## [Feature] Service discovery and migration wizard

**Branch:** feat/our-pages

### Problem

Agents build services and HTML pages outside Our Pages (listening on ports, writing HTML to disk). There's no mechanism to discover what exists and migrate it. This creates a two-tier system that defeats Our Pages as a unified surface.

### Proposed Solution

An audit tool that discovers existing services and offers to migrate them.

**Triggered by agent prompts:**

- "What have I built?"
- "Audit my services"
- "Migrate everything to Our Pages"

**Discovery sources:**

- Listening ports (`ss -tlnp`) checked against known service signatures
- HTML files in common directories
- Existing `link` type pages (redirect-only, candidates for inline migration)
- Registered systemd user services with web interfaces

**Output to agent:**

```json
{
  "unpublished_services": [...],
  "publishable_html_files": [...],
  "link_type_upgrade_candidates": [...]
}
```

Agent presents as a checklist, asks human to confirm before acting.

### Implementation

- `src/agents/tools/our-pages-audit.ts` — new tool: `our_pages_audit()`
- `src/gateway/server-methods/our-pages.ts` — `/our-pages/audit` endpoint
- Discovery logic scoped to common directories only (no arbitrary filesystem scan)

### Notes

This is a P3 feature — valuable but not blocking the initial PR. File as a follow-up once P0-P2 land.
