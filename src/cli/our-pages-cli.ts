import type { Command } from "commander";
import { addGatewayClientOptions, callGatewayFromCli } from "./gateway-rpc.js";

export function registerOurPagesCli(program: Command) {
  const cmd = program.command("our-pages").description("Manage Our Pages");

  addGatewayClientOptions(
    cmd
      .command("list")
      .description("List saved pages")
      .option("--tag <tag>", "Filter by tag")
      .option("--type <type>", "Filter by type (inline, link, file)")
      .option("--include-deleted", "Include soft-deleted pages"),
  ).action(async (opts) => {
    const result = (await callGatewayFromCli("our_pages.list", opts, {
      tag: opts.tag,
      type: opts.type,
      include_deleted: opts.includeDeleted,
    })) as { pages: Array<Record<string, unknown>>; total: number };
    console.table(
      result.pages.map((p) => ({
        slug: p.slug,
        title: p.title,
        type: p.type,
        version: p.version,
      })),
    );
    console.log(`Total: ${result.total}`);
  });

  addGatewayClientOptions(cmd.command("info <slug>").description("Show page details")).action(
    async (slug, opts) => {
      const result = await callGatewayFromCli("our_pages.get", opts, { slug });
      console.log(JSON.stringify(result, null, 2));
    },
  );

  addGatewayClientOptions(cmd.command("delete <slug>").description("Soft-delete a page")).action(
    async (slug, opts) => {
      const result = (await callGatewayFromCli("our_pages.delete", opts, { slug })) as {
        deleted_at: string;
      };
      console.log(`Moved to trash: ${slug} (deleted_at: ${result.deleted_at})`);
    },
  );

  addGatewayClientOptions(
    cmd.command("restore <slug>").description("Restore a soft-deleted page"),
  ).action(async (slug, opts) => {
    await callGatewayFromCli("our_pages.restore", opts, { slug });
    console.log(`Restored: ${slug}`);
  });

  addGatewayClientOptions(cmd.command("status").description("Show Our Pages status")).action(
    async (opts) => {
      const result = (await callGatewayFromCli("our_pages.status", opts)) as {
        mode: string;
        count: number;
      };
      console.log(`Mode:  ${result.mode}`);
      console.log(`Pages: ${result.count}`);
    },
  );
}
