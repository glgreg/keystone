/**
 * `keystone stone show <id>`: prints a context packet: the stone itself plus
 * one-line summaries of every related stone and its transitive impact set.
 */

import { readFileSync } from "node:fs";
import type { CommandResult, Context } from "../core/context.ts";
import { buildGraph, impactOf } from "../core/graph.ts";
import { scan } from "../core/workspace.ts";
import { KeystoneError, RELATION_KINDS } from "../types.ts";

export interface ShowOptions {
  json?: boolean;
}

export function show(ctx: Context, id: string | undefined, options: ShowOptions): CommandResult {
  if (!id) throw new KeystoneError("usage: keystone stone show <id>");
  const graph = buildGraph(scan(ctx.root).stones);
  const stone = graph.nodes.get(id);
  if (!stone) throw new KeystoneError(`unknown stone '${id}'. Try 'keystone stone search ${id}'.`);

  const related = RELATION_KINDS.flatMap((kind) =>
    stone.meta.relations[kind].map((target) => {
      const other = graph.nodes.get(target);
      return { kind, id: target, path: other?.relPath ?? null, summary: other?.meta.summary ?? null };
    }),
  );
  const impact = impactOf(graph, id, Number.POSITIVE_INFINITY);

  if (options.json) {
    ctx.io.stdout(
      JSON.stringify(
        { id, path: stone.relPath, meta: stone.meta, body: stone.body, related, impact },
        null,
        2,
      ),
    );
    return 0;
  }

  ctx.io.stdout(`# ${stone.relPath}`);
  ctx.io.stdout(readFileSync(stone.path, "utf8").trimEnd());
  ctx.io.stdout("");
  ctx.io.stdout("# Related stones");
  if (related.length === 0) ctx.io.stdout("(none)");
  for (const item of related) {
    const location = item.path ?? "missing";
    ctx.io.stdout(`- ${item.kind.replace("_", " ")}: ${item.id} (${location})${item.summary ? ` - ${item.summary}` : ""}`);
  }
  ctx.io.stdout("");
  ctx.io.stdout(`# Transitive impact (stones that depend on '${id}')`);
  ctx.io.stdout(impact.length > 0 ? impact.join(", ") : "(none)");
  return 0;
}
