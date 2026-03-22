import { html, nothing } from "lit";
import type { GatewayBrowserClient } from "../gateway.ts";

export type OurPagesState = {
  connected: boolean;
  client: GatewayBrowserClient | null;
  canvasHostUrl: string | null;
  /** Base path for published pages, e.g. "/ourpages". Defaults to "/ourpages". */
  ourPagesBasePath?: string | null;
};

type PageEntry = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  default_icon: string;
  type: string;
  version: number;
  pinned: boolean;
  tags: string[];
  updated_at: string;
  deleted_at?: string | null;
};

type OurPagesViewState = {
  pages: PageEntry[];
  total: number;
  loading: boolean;
  error: string | null;
  search: string;
  selectedTag: string | null;
  viewingPage: PageEntry | null;
};

const viewState: OurPagesViewState = {
  pages: [],
  total: 0,
  loading: false,
  error: null,
  search: "",
  selectedTag: null,
  viewingPage: null,
};

const DEFAULT_OUR_PAGES_BASE = "/ourpages";

function pageUrl(slug: string, canvasHostUrl: string | null, basePath?: string | null): string {
  const base = basePath ?? DEFAULT_OUR_PAGES_BASE;
  // Use the canvas host origin if available (handles proxy port), otherwise current origin
  const origin = canvasHostUrl ? new URL(canvasHostUrl).origin : window.location.origin;
  return `${origin}${base}/${slug}`;
}

function typeBadge(type: string) {
  switch (type) {
    case "inline":
      return html`
        <span class="type-badge inline" title="Inline HTML">&#x25CF; inline</span>
      `;
    case "link":
      return html`
        <span class="type-badge link" title="External link">&#x25CB; link</span>
      `;
    case "file":
      return html`
        <span class="type-badge file" title="File-backed">&#x25C6; file</span>
      `;
    case "safe":
    default:
      return html`
        <span class="type-badge safe" title="Restricted">&#x2298; safe</span>
      `;
  }
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function loadPages(client: GatewayBrowserClient | null) {
  if (!client) {
    return;
  }
  viewState.loading = true;
  viewState.error = null;
  try {
    const params: Record<string, unknown> = {};
    if (viewState.search) {
      params.search = viewState.search;
    }
    if (viewState.selectedTag) {
      params.tag = viewState.selectedTag;
    }
    const result = await client.request<{ pages: PageEntry[]; total: number }>(
      "our_pages.list",
      params,
    );
    viewState.pages = result.pages;
    viewState.total = result.total;
  } catch (e) {
    viewState.error = String(e);
  } finally {
    viewState.loading = false;
  }
}

async function handleDelete(client: GatewayBrowserClient | null, slug: string) {
  if (!client) {
    return;
  }
  await client.request("our_pages.delete", { slug });
  await loadPages(client);
}

async function handlePin(client: GatewayBrowserClient | null, slug: string, pinned: boolean) {
  if (!client) {
    return;
  }
  await client.request("our_pages.pin", { slug, pinned });
  await loadPages(client);
}

function renderCard(
  page: PageEntry,
  canvasHostUrl: string | null,
  client: GatewayBrowserClient | null,
  onView: (page: PageEntry) => void,
  requestUpdate: () => void,
  ourPagesBasePath?: string | null,
) {
  const url = pageUrl(page.slug, canvasHostUrl, ourPagesBasePath);
  return html`
    <div
      class="our-pages-card ${page.pinned ? "pinned" : ""}"
      @click=${() => onView(page)}
    >
      <div class="card-header">
        <span class="card-icon">${page.default_icon}</span>
        <span class="card-title">${page.title}</span>
        <div class="card-actions">
          <button
            class="card-action-btn"
            title="${page.pinned ? "Unpin" : "Pin"}"
            @click=${(e: Event) => {
              e.stopPropagation();
              void handlePin(client, page.slug, !page.pinned).then(requestUpdate);
            }}
          >
            ${page.pinned ? "Unpin" : "Pin"}
          </button>
          <a
            href=${url}
            target="_blank"
            rel="noopener noreferrer"
            class="card-action-btn"
            title="Open in new tab"
            @click=${(e: Event) => e.stopPropagation()}
          >
            Open
          </a>
          <button
            class="card-action-btn"
            title="Copy URL"
            @click=${(e: Event) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(url);
            }}
          >
            Copy
          </button>
          <button
            class="card-action-btn danger"
            title="Delete"
            @click=${(e: Event) => {
              e.stopPropagation();
              void handleDelete(client, page.slug).then(requestUpdate);
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <div class="card-meta">
        ${typeBadge(page.type)}
        <span class="card-version">v${page.version}</span>
        <span class="card-time">${relativeTime(page.updated_at)}</span>
      </div>
      ${page.description ? html`<div class="card-desc">${page.description}</div>` : nothing}
      ${
        page.tags.length
          ? html`<div class="card-tags">
            ${page.tags.map((tag) => html`<span class="tag-chip">${tag}</span>`)}
          </div>`
          : nothing
      }
    </div>
  `;
}

function renderViewer(page: PageEntry, canvasHostUrl: string | null, onClose: () => void, ourPagesBasePath?: string | null) {
  const url = pageUrl(page.slug, canvasHostUrl, ourPagesBasePath);
  return html`
    <div class="our-pages-viewer">
      <div class="viewer-header">
        <button class="viewer-back" @click=${onClose}>← Our Pages</button>
        <span class="viewer-title">${page.default_icon} ${page.title}</span>
        <span class="viewer-version">v${page.version}</span>
      </div>
      <div class="viewer-iframe-wrap">
        <iframe
          src=${url}
          title=${page.title}
          sandbox="allow-scripts allow-forms"
          referrerpolicy="no-referrer"
          style="width:100%;height:100%;border:none;"
        ></iframe>
      </div>
      <div class="viewer-footer">
        <div class="viewer-url-bar">
          <a href=${url} target="_blank" rel="noopener noreferrer">Open in new tab</a>
          <code>${url}</code>
          <button @click=${() => navigator.clipboard.writeText(url)}>Copy</button>
        </div>
        <p class="security-notice">
          Secure mode: Clipboard and local storage are restricted in this preview.
          Open in a new tab for full browser capabilities.
        </p>
      </div>
    </div>
  `;
}

export function renderOurPages(state: OurPagesState, requestUpdate: () => void) {
  // If viewing a specific page, render the viewer
  if (viewState.viewingPage) {
    return renderViewer(viewState.viewingPage, state.canvasHostUrl, () => {
      viewState.viewingPage = null;
      requestUpdate();
    }, state.ourPagesBasePath);
  }

  // Load pages on first render or when connected
  if (state.connected && viewState.pages.length === 0 && !viewState.loading && !viewState.error) {
    void loadPages(state.client).then(requestUpdate);
  }

  // Collect all unique tags from pages
  const allTags = [...new Set(viewState.pages.flatMap((p) => p.tags))].toSorted();
  const pinnedPages = viewState.pages.filter((p) => p.pinned);
  const unpinnedPages = viewState.pages.filter((p) => !p.pinned);

  return html`
    <style>
      .our-pages-container { padding: 0; }
      .our-pages-toolbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
      .our-pages-search { flex: 1; min-width: 200px; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color, rgba(255,255,255,0.12)); background: var(--input-bg, rgba(255,255,255,0.06)); color: inherit; font-size: 13px; }
      .our-pages-search:focus { outline: none; border-color: var(--accent-color, #58a6ff); }
      .tag-filter { display: flex; gap: 4px; flex-wrap: wrap; }
      .tag-filter-btn { padding: 3px 8px; border-radius: 12px; border: 1px solid var(--border-color, rgba(255,255,255,0.12)); background: transparent; color: inherit; font-size: 11px; cursor: pointer; }
      .tag-filter-btn.active { background: var(--accent-color, #58a6ff); color: #fff; border-color: var(--accent-color, #58a6ff); }
      .our-pages-section-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.6; margin: 16px 0 8px; }
      .our-pages-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
      .our-pages-card { padding: 12px; border-radius: 10px; border: 1px solid var(--border-color, rgba(255,255,255,0.10)); background: var(--card-bg, rgba(255,255,255,0.04)); cursor: pointer; transition: border-color 0.15s; }
      .our-pages-card:hover { border-color: var(--accent-color, #58a6ff); }
      .our-pages-card.pinned { border-left: 3px solid var(--accent-color, #58a6ff); }
      .card-header { display: flex; align-items: center; gap: 8px; }
      .card-icon { font-size: 18px; }
      .card-title { font-weight: 600; font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card-actions { display: none; gap: 4px; }
      .our-pages-card:hover .card-actions { display: flex; }
      .card-action-btn { padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border-color, rgba(255,255,255,0.12)); background: transparent; color: inherit; font-size: 11px; cursor: pointer; text-decoration: none; }
      .card-action-btn.danger { color: #f85149; }
      .card-meta { display: flex; gap: 8px; align-items: center; margin-top: 6px; font-size: 11px; opacity: 0.7; }
      .type-badge { padding: 1px 6px; border-radius: 8px; border: 1px solid var(--border-color, rgba(255,255,255,0.10)); font-size: 10px; }
      .card-desc { margin-top: 6px; font-size: 12px; opacity: 0.7; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .card-tags { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
      .tag-chip { padding: 1px 6px; border-radius: 8px; background: rgba(255,255,255,0.08); font-size: 10px; }
      .our-pages-empty { text-align: center; padding: 48px 24px; opacity: 0.6; }
      .our-pages-empty p { margin: 8px 0; font-size: 13px; }
      .our-pages-viewer { display: flex; flex-direction: column; height: 100%; }
      .viewer-header { display: flex; align-items: center; gap: 12px; padding: 8px 12px; border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.10)); }
      .viewer-back { background: none; border: none; color: var(--accent-color, #58a6ff); cursor: pointer; font-size: 13px; padding: 4px 8px; }
      .viewer-title { font-weight: 600; font-size: 14px; }
      .viewer-version { font-size: 11px; opacity: 0.6; }
      .viewer-iframe-wrap { flex: 1; min-height: 0; }
      .viewer-footer { padding: 8px 12px; border-top: 1px solid var(--border-color, rgba(255,255,255,0.10)); font-size: 12px; }
      .viewer-url-bar { display: flex; align-items: center; gap: 8px; }
      .viewer-url-bar code { flex: 1; font-size: 11px; opacity: 0.6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .viewer-url-bar a { color: var(--accent-color, #58a6ff); text-decoration: none; font-size: 12px; }
      .viewer-url-bar button { background: none; border: 1px solid var(--border-color, rgba(255,255,255,0.12)); color: inherit; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 11px; }
      .security-notice { margin: 4px 0 0; font-size: 11px; opacity: 0.5; }
    </style>
    <div class="our-pages-container">
      <div class="our-pages-toolbar">
        <input
          class="our-pages-search"
          type="text"
          placeholder="Search pages..."
          .value=${viewState.search}
          @input=${(e: Event) => {
            viewState.search = (e.target as HTMLInputElement).value;
            void loadPages(state.client).then(requestUpdate);
          }}
        />
        <button
          class="card-action-btn"
          @click=${() => {
            void loadPages(state.client).then(requestUpdate);
          }}
        >
          Refresh
        </button>
      </div>

      ${
        allTags.length
          ? html`<div class="tag-filter">
            ${allTags.map(
              (tag) => html`
                <button
                  class="tag-filter-btn ${viewState.selectedTag === tag ? "active" : ""}"
                  @click=${() => {
                    viewState.selectedTag = viewState.selectedTag === tag ? null : tag;
                    void loadPages(state.client).then(requestUpdate);
                  }}
                >
                  ${tag}
                </button>
              `,
            )}
          </div>`
          : nothing
      }

      ${
        viewState.loading
          ? html`
              <div class="our-pages-empty"><p>Loading...</p></div>
            `
          : nothing
      }
      ${
        viewState.error
          ? html`<div class="our-pages-empty"><p style="color:#f85149">${viewState.error}</p></div>`
          : nothing
      }
      ${
        !viewState.loading && !viewState.error && viewState.pages.length === 0
          ? html`
              <div class="our-pages-empty">
                <p>No pages yet.</p>
                <p>Your agent can save dashboards and tools here. Ask your agent to build something.</p>
              </div>
            `
          : nothing
      }

      ${
        pinnedPages.length
          ? html`
            <div class="our-pages-section-title">Pinned</div>
            <div class="our-pages-grid">
              ${pinnedPages.map((p) =>
                renderCard(
                  p,
                  state.canvasHostUrl,
                  state.client,
                  (page) => {
                    viewState.viewingPage = page;
                    requestUpdate();
                  },
                  requestUpdate,
                  state.ourPagesBasePath,
                ),
              )}
            </div>
          `
          : nothing
      }
      ${
        unpinnedPages.length
          ? html`
            ${
              pinnedPages.length
                ? html`
                    <div class="our-pages-section-title">All Pages</div>
                  `
                : nothing
            }
            <div class="our-pages-grid">
              ${unpinnedPages.map((p) =>
                renderCard(
                  p,
                  state.canvasHostUrl,
                  state.client,
                  (page) => {
                    viewState.viewingPage = page;
                    requestUpdate();
                  },
                  requestUpdate,
                  state.ourPagesBasePath,
                ),
              )}
            </div>
          `
          : nothing
      }
    </div>
  `;
}
