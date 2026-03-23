/**
 * Default pages seeded into Our Pages on first initialization.
 * The "getting-started" slug is soft-protected: it can be deleted by users
 * but is auto-created when the DB is first initialized and empty.
 */

export const GETTING_STARTED_SLUG = "getting-started";

export const GETTING_STARTED_PAGE = {
  slug: GETTING_STARTED_SLUG,
  title: "Getting Started with Our Pages",
  description: "Learn what Our Pages is and how to use it with your AI agent.",
  default_icon: "\uD83D\uDE80",
  type: "inline" as const,
  tags: ["guide", "onboarding"],
  html: `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Getting Started with Our Pages</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:#0f1117;color:#e1e4e8;line-height:1.6;padding:2rem;max-width:720px;margin:0 auto}
  h1{font-size:1.8rem;margin-bottom:.5rem;color:#f0f6fc}
  h2{font-size:1.2rem;margin-top:2rem;margin-bottom:.5rem;color:#c9d1d9;border-bottom:1px solid #21262d;padding-bottom:.3rem}
  p{margin:.6rem 0;color:#b1bac4}
  code{background:#161b22;padding:.15rem .4rem;border-radius:4px;font-size:.9em;color:#79c0ff}
  .hero{text-align:center;padding:2rem 0 1rem}
  .hero-icon{font-size:3rem;margin-bottom:.5rem}
  .card{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:1rem 1.2rem;margin:.8rem 0}
  .card-title{font-weight:600;color:#f0f6fc;margin-bottom:.3rem}
  .prompt{font-style:italic;color:#8b949e}
  .note{background:#1c2128;border-left:3px solid #3fb950;padding:.8rem 1rem;border-radius:4px;margin-top:1.5rem}
  .note strong{color:#3fb950}
  a{color:#58a6ff;text-decoration:none}
  a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="hero">
  <div class="hero-icon">\uD83D\uDE80</div>
  <h1>Our Pages</h1>
  <p>Your AI agent can publish pages, dashboards, and tools right here.</p>
</div>

<h2>What is Our Pages?</h2>
<p>Our Pages is a built-in publishing surface for your OpenClaw gateway. When you ask your agent to build something visual &mdash; a dashboard, a report, a calculator, or any HTML tool &mdash; it publishes the result here instead of writing files to disk.</p>
<p>Every page gets a permanent URL at <code>/ourpages/&lt;slug&gt;</code> that you can bookmark, share, or embed.</p>

<h2>Try these prompts</h2>
<div class="card">
  <div class="card-title">\uD83D\uDCCA Dashboard</div>
  <p class="prompt">"Build me a system monitor dashboard that shows CPU, memory, and disk usage."</p>
</div>
<div class="card">
  <div class="card-title">\uD83D\uDDC2\uFE0F Report</div>
  <p class="prompt">"Create an HTML report summarizing the git activity in this repo for the past week."</p>
</div>
<div class="card">
  <div class="card-title">\uD83E\uDDEE Tool</div>
  <p class="prompt">"Build a JSON formatter tool I can paste data into."</p>
</div>
<div class="card">
  <div class="card-title">\uD83C\uDFA8 Creative</div>
  <p class="prompt">"Design a color palette explorer with live preview."</p>
</div>

<h2>How it works</h2>
<p>When Our Pages is enabled, your agent has access to the <code>our_pages_publish</code> tool. It automatically uses this tool to publish any HTML content it creates, making it instantly accessible in your browser.</p>
<p>Pages are versioned &mdash; republishing the same slug updates the content and bumps the version. Deleted pages can be recovered within 30 days.</p>

<div class="note">
  <strong>Tip:</strong> This page was auto-generated on first run. Feel free to delete it or ask your agent to replace it with something more useful!
</div>
</body>
</html>`,
};
