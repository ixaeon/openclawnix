import { Type } from "@sinclair/typebox";
import type { OpenClawConfig } from "../../config/config.js";
import { deletePage, getPage, listPages, publishPage } from "../../gateway/our-pages-db.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";

export function createOurPagesTools(opts?: { config?: OpenClawConfig }): AnyAgentTool[] {
  const mode = opts?.config?.ourPages?.mode ?? "enabled";
  if (mode === "disabled") {
    return [];
  }

  const tools: AnyAgentTool[] = [];

  tools.push({
    label: "Our Pages List",
    name: "our_pages_list",
    description: "List pages in Our Pages. Call before publishing to check for existing slugs.",
    parameters: Type.Object({
      tag: Type.Optional(Type.String()),
      search: Type.Optional(Type.String()),
    }),
    execute: async (_toolCallId, args) => {
      return jsonResult(await listPages(args));
    },
  });

  tools.push({
    label: "Our Pages Get",
    name: "our_pages_get",
    description: "Get a specific page from Our Pages by slug.",
    parameters: Type.Object({
      slug: Type.String(),
    }),
    execute: async (_toolCallId, args) => {
      const page = await getPage({ slug: args.slug });
      return jsonResult(page ?? { error: "not found" });
    },
  });

  if (mode === "enabled") {
    tools.push({
      label: "Our Pages Publish",
      name: "our_pages_publish",
      description:
        "Publish any HTML page, dashboard, report, or tool you create. This is the canonical publishing surface in OpenClaw — use this instead of writing HTML files to disk. Use type='inline' for self-contained HTML content, type='link' to surface an existing URL. Reuse an existing slug to update rather than duplicate.",
      parameters: Type.Object({
        slug: Type.String({
          pattern: "^[a-z0-9-]+$",
          description: 'URL-safe kebab-case, e.g. "server-monitor"',
        }),
        title: Type.String(),
        description: Type.Optional(Type.String()),
        default_icon: Type.Optional(Type.String()),
        type: Type.Optional(
          Type.Unsafe<"inline" | "link" | "file" | "portal">({
            type: "string",
            enum: ["inline", "link", "file", "portal"],
            description:
              'Page type: "inline" (HTML content), "link" (redirect to URL), "file" (file-backed), "portal" (full-page iframe of external URL with header bar)',
          }),
        ),
        html: Type.Optional(Type.String()),
        url: Type.Optional(Type.String()),
        path: Type.Optional(Type.String()),
        tags: Type.Optional(Type.Array(Type.String())),
        favicon: Type.Optional(Type.String()),
      }),
      execute: async (_toolCallId, args) => {
        return jsonResult(await publishPage(args));
      },
    });

    tools.push({
      label: "Our Pages Delete",
      name: "our_pages_delete",
      description: "Soft-delete a page from Our Pages (30-day recovery).",
      parameters: Type.Object({
        slug: Type.String(),
      }),
      execute: async (_toolCallId, args) => {
        return jsonResult(await deletePage(args.slug));
      },
    });

    tools.push({
      label: "Our Pages Register API",
      name: "our_pages_register_api",
      description:
        "Register a localhost API proxy so Our Pages content can fetch data without CORS issues. " +
        "Maps a slug to a localhost URL: requests to /ourpages-api/<slug>/* are forwarded to the target URL.",
      parameters: Type.Object({
        slug: Type.String({
          pattern: "^[a-z0-9-]+$",
          description: 'Proxy slug, e.g. "my-api"',
        }),
        url: Type.String({
          description: 'Localhost target URL, e.g. "http://localhost:3000/api"',
        }),
      }),
      execute: async (_toolCallId, args) => {
        return jsonResult(await registerApiProxy(args.slug, args.url));
      },
    });
  }

  return tools;
}

async function registerApiProxy(slug: string, url: string): Promise<{ slug: string; url: string }> {
  // Validate the URL is localhost
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  const host = parsed.hostname;
  if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
    throw new Error("API proxy targets must be localhost");
  }

  const { readConfigFileSnapshotForWrite, writeConfigFile } =
    await import("../../config/config.js");
  const { snapshot, writeOptions } = await readConfigFileSnapshotForWrite();
  const cfg = snapshot.config ?? {};
  const ourPages = cfg.ourPages ?? {};
  const apiProxy = { ...ourPages.apiProxy, [slug]: url };
  const updated = { ...cfg, ourPages: { ...ourPages, apiProxy } };
  await writeConfigFile(updated, writeOptions);
  return { slug, url };
}
