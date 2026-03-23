## [Feature] Auto-inject system prompt fragment when Our Pages is enabled

**Branch:** feat/our-pages

### Problem

Agents default to writing HTML files to disk or serving on ports — old habits from before Our Pages existed. The only current guidance is in per-deployment AGENTS.md files, which don't exist for most users.

### Proposed Solution

When `ourPages.mode !== "disabled"`, the gateway injects a short instruction fragment into every agent session's system context.

**Proposed text:**

```
Our Pages is enabled. When you build any HTML page, dashboard, report, or tool,
publish it with `our_pages_publish` (type='inline' for HTML content).
This keeps everything discoverable in one place and works across all deployment
configurations. Do not deliver HTML by writing files to disk.
```

### Why in source, not AGENTS.md

- Works for every OpenClaw deployment automatically
- New users get the behavior without configuration
- Per-deployment AGENTS.md can still override/extend

### Configuration

```json
{
  "ourPages": {
    "injectSystemPrompt": true
  }
}
```

Default: `true` when Our Pages is enabled.

### Implementation

- Find system prompt assembly location in `src/context-engine/` or equivalent
- Add fragment injection conditional on `ourPages.mode` and `ourPages.injectSystemPrompt`
- Fragment should be concise — one short paragraph, not a wall of text

### Priority

**P0** — highest value, lowest complexity. This single change meaningfully improves agent behavior for all users who get the Our Pages update.
