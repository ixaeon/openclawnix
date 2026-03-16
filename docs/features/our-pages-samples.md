# Our Pages — Sample Pages

These are example prompts you can give your agent to publish pages to Our Pages. Each one is a single ask that produces something immediately useful, and each page goes to the same Our Pages tab — so over time you build up a collection.

---

## System Status Dashboard

> "Create a system status page in Our Pages that shows the current time and a welcome message."

What the agent publishes (slug: `system-status`):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>System Status</title>
    <style>
      body {
        font-family: system-ui, sans-serif;
        background: #0d1117;
        color: #c9d1d9;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      h1 {
        font-size: 2rem;
        margin-bottom: 0.5rem;
      }
      .time {
        font-size: 3rem;
        font-weight: bold;
        color: #58a6ff;
        font-variant-numeric: tabular-nums;
      }
      .label {
        color: #8b949e;
        font-size: 0.9rem;
        margin-top: 1rem;
      }
    </style>
  </head>
  <body>
    <h1>⚡ System Status</h1>
    <div class="time" id="clock"></div>
    <div class="label">All systems operational</div>
    <script>
      function tick() {
        document.getElementById("clock").textContent = new Date().toLocaleTimeString();
      }
      tick();
      setInterval(tick, 1000);
    </script>
  </body>
</html>
```

**The point:** A live clock. Simple, but it shows the pattern — the agent creates a self-contained page, saves it once, and it lives in your Our Pages tab at `/__openclaw__/our-pages/system-status`. Every time you open it, the clock is ticking.

---

## Quick Reference / Cheat Sheet

> "Save a keyboard shortcuts cheat sheet for vim to Our Pages."

What the agent publishes (slug: `vim-cheatsheet`):

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Vim Cheat Sheet</title>
    <style>
      body {
        font-family: monospace;
        background: #0d1117;
        color: #c9d1d9;
        padding: 2rem;
      }
      h1 {
        color: #f78166;
      }
      h2 {
        color: #79c0ff;
        border-bottom: 1px solid #30363d;
        padding-bottom: 4px;
      }
      table {
        border-collapse: collapse;
        width: 100%;
        margin-bottom: 2rem;
      }
      td {
        padding: 6px 12px;
        border-bottom: 1px solid #21262d;
      }
      td:first-child {
        color: #a5d6ff;
        width: 160px;
        font-weight: bold;
      }
    </style>
  </head>
  <body>
    <h1>⌨️ Vim Cheat Sheet</h1>
    <h2>Navigation</h2>
    <table>
      <tr>
        <td>h j k l</td>
        <td>Left / Down / Up / Right</td>
      </tr>
      <tr>
        <td>w / b</td>
        <td>Next / previous word</td>
      </tr>
      <tr>
        <td>gg / G</td>
        <td>Top / bottom of file</td>
      </tr>
      <tr>
        <td>Ctrl+d / Ctrl+u</td>
        <td>Half-page down / up</td>
      </tr>
    </table>
    <h2>Editing</h2>
    <table>
      <tr>
        <td>i / a</td>
        <td>Insert before / after cursor</td>
      </tr>
      <tr>
        <td>o / O</td>
        <td>New line below / above</td>
      </tr>
      <tr>
        <td>dd / yy</td>
        <td>Delete / yank (copy) line</td>
      </tr>
      <tr>
        <td>p / P</td>
        <td>Paste after / before cursor</td>
      </tr>
      <tr>
        <td>u / Ctrl+r</td>
        <td>Undo / redo</td>
      </tr>
      <tr>
        <td>ciw / diw</td>
        <td>Change / delete inner word</td>
      </tr>
    </table>
    <h2>File</h2>
    <table>
      <tr>
        <td>:w</td>
        <td>Save</td>
      </tr>
      <tr>
        <td>:q / :q!</td>
        <td>Quit / force quit</td>
      </tr>
      <tr>
        <td>:wq</td>
        <td>Save and quit</td>
      </tr>
      <tr>
        <td>:e filename</td>
        <td>Open file</td>
      </tr>
    </table>
  </body>
</html>
```

**The point:** A reference doc you'll actually use. Lives permanently in Our Pages, no searching required. Ask for a git cheat sheet, a markdown syntax guide, a color palette — same pattern.

---

## Link to a Local Service

> "Register my local Grafana instance in Our Pages."

What the agent publishes (slug: `grafana`):

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

**The point:** Our Pages becomes a launchpad for local services, not just inline HTML. You could register Grafana, a file browser, a local dev server — anything running on localhost. They all show up as cards in the same tab. One place for everything the agent has set up.

---

## Multiple Pages, One Tab

The real value shows up when you have several:

| Page            | Slug             | Type   | What it is                       |
| --------------- | ---------------- | ------ | -------------------------------- |
| Server Monitor  | `server-monitor` | inline | CPU/memory chart the agent built |
| Vim Cheat Sheet | `vim-cheatsheet` | inline | Reference you asked for once     |
| Grafana         | `grafana`        | link   | Local Grafana instance           |
| Bill Tracker    | `bill-tracker`   | inline | Recurring expenses table         |
| Runbook         | `ops-runbook`    | file   | Markdown file the agent updates  |

All in the same Our Pages tab. Cards show the version number and last-updated time. Pin the ones you use most. The agent knows to update the existing slug rather than create a duplicate.

---

## Teaching the Agent

If you have the `our-pages` skill installed, the agent already knows when to offer this. Without the skill, you can always just ask:

> "Save this to Our Pages"
> "Keep this dashboard somewhere I can come back to it"
> "Add a link to my local service in Our Pages"

The agent will call `our_pages_list` first to check for existing slugs, then publish or update as needed.
