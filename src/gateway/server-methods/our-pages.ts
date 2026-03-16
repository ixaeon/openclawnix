import { loadConfig } from "../../config/config.js";
import {
  publishPage,
  listPages,
  getPage,
  deletePage,
  restorePage,
  pinPage,
  getOurPagesStatus,
} from "../our-pages-db.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function resolveMode(): "enabled" | "read-only" | "disabled" {
  return loadConfig()?.ourPages?.mode ?? "enabled";
}

function isWriteBlocked(mode: ReturnType<typeof resolveMode>): string | null {
  if (mode === "disabled") {
    return "Our Pages is disabled";
  }
  if (mode === "read-only") {
    return "Our Pages is read-only";
  }
  return null;
}

export const ourPagesHandlers: GatewayRequestHandlers = {
  "our_pages.status": async ({ respond }) => {
    respond(true, await getOurPagesStatus(resolveMode()));
  },

  "our_pages.list": async ({ params, respond }) => {
    const mode = resolveMode();
    if (mode === "disabled") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Our Pages is disabled"));
      return;
    }
    respond(true, await listPages(params as Parameters<typeof listPages>[0]));
  },

  "our_pages.get": async ({ params, respond }) => {
    const mode = resolveMode();
    if (mode === "disabled") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Our Pages is disabled"));
      return;
    }
    const page = await getPage(params as Parameters<typeof getPage>[0]);
    if (!page) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "Page not found"));
      return;
    }
    respond(true, page);
  },

  "our_pages.publish": async ({ params, respond }) => {
    const err = isWriteBlocked(resolveMode());
    if (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, err));
      return;
    }
    try {
      respond(true, await publishPage(params as Parameters<typeof publishPage>[0]));
    } catch (e) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, String(e)));
    }
  },

  "our_pages.delete": async ({ params, respond }) => {
    const err = isWriteBlocked(resolveMode());
    if (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, err));
      return;
    }
    respond(true, await deletePage((params as { slug: string }).slug));
  },

  "our_pages.restore": async ({ params, respond }) => {
    const err = isWriteBlocked(resolveMode());
    if (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, err));
      return;
    }
    respond(true, await restorePage((params as { slug: string }).slug));
  },

  "our_pages.pin": async ({ params, respond }) => {
    const err = isWriteBlocked(resolveMode());
    if (err) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, err));
      return;
    }
    const p = params as { slug: string; pinned: boolean };
    respond(true, await pinPage(p.slug, p.pinned));
  },
};
