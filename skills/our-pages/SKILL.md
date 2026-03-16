# Our Pages Manager

Save pages, dashboards, and tools to the user's Our Pages tab using `our_pages_publish`.

## When to PUBLISH

- Monitoring dashboards (server, node, network)
- Data trackers (bills, crypto, property)
- Interactive tools (calculators, configurators)
- Reference pages (cheat sheets, runbooks)
- Links to local services the agent has set up

## When NOT to publish

- One-off chat explanations
- Temporary visualizations for a single question
- Content the user hasn't seen yet — show on Canvas first, then offer to save

When in doubt: ask "Would you like me to save this to Our Pages?"

## Workflow

1. Call `our_pages_list` first — reuse an existing slug to update, don't duplicate
2. For inline pages: complete self-contained HTML, dark theme, responsive, no external fetch
3. For linked services: `type: "link"` with `url: "http://localhost:PORT"`

## Naming

- slug: kebab-case, descriptive — `"server-monitor"` not `"dashboard1"`
- title: Short noun-phrase — `"Server Monitor"`
- default_icon: single emoji

## Iframe Limitations (in the viewer)

Pages run sandboxed — no clipboard, no localStorage, no outbound fetch.
Design for sandbox first. Use "open in new tab" for full capabilities.

```js
const inSandbox = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();
```

## Live Updates from a Page Button

```js
window.location.href = `openclaw://agent?message=${encodeURIComponent("Refresh server stats")}`;
```

Do NOT call Gateway RPC directly from page HTML.
