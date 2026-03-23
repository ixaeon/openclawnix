import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

const OURPAGES_API_PREFIX = "/ourpages-api/";

/**
 * Check if a request path matches the /ourpages-api/ prefix.
 */
export function isOurPagesApiPath(pathname: string): boolean {
  return pathname.startsWith(OURPAGES_API_PREFIX);
}

/**
 * Extract the proxy slug from a /ourpages-api/<slug>[/rest] path.
 */
export function extractProxySlug(pathname: string): { slug: string; rest: string } {
  const after = pathname.slice(OURPAGES_API_PREFIX.length);
  const slashIdx = after.indexOf("/");
  if (slashIdx === -1) {
    return { slug: after, rest: "" };
  }
  return { slug: after.slice(0, slashIdx), rest: after.slice(slashIdx) };
}

/**
 * Proxy a request to a configured localhost URL.
 * Only forwards to URLs explicitly listed in the apiProxy config map.
 */
export async function proxyOurPagesApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: {
    apiProxy: Record<string, string>;
    pathname: string;
  },
): Promise<boolean> {
  if (!isOurPagesApiPath(opts.pathname)) {
    return false;
  }

  const { slug, rest } = extractProxySlug(opts.pathname);
  const targetBase = opts.apiProxy[slug];

  if (!targetBase) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "proxy target not configured" }));
    return true;
  }

  let targetUrl: URL;
  try {
    targetUrl = new URL(
      rest + (req.url?.includes("?") ? `?${req.url.split("?")[1]}` : ""),
      targetBase,
    );
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "invalid proxy URL" }));
    return true;
  }

  // Only proxy to localhost targets
  const hostname = targetUrl.hostname;
  if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "::1") {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "proxy target must be localhost" }));
    return true;
  }

  return new Promise<boolean>((resolve) => {
    const proxyReq = httpRequest(
      {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: targetUrl.pathname + targetUrl.search,
        method: req.method,
        headers: {
          ...req.headers,
          host: targetUrl.host,
        },
      },
      (proxyRes) => {
        res.statusCode = proxyRes.statusCode ?? 502;
        // Forward response headers, removing hop-by-hop headers
        const hopByHop = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade"]);
        for (const [key, value] of Object.entries(proxyRes.headers)) {
          if (value != null && !hopByHop.has(key.toLowerCase())) {
            res.setHeader(key, value);
          }
        }
        proxyRes.pipe(res);
        proxyRes.on("end", () => resolve(true));
      },
    );

    proxyReq.on("error", () => {
      if (!res.headersSent) {
        res.statusCode = 502;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "proxy target unreachable" }));
      }
      resolve(true);
    });

    req.pipe(proxyReq);
  });
}
