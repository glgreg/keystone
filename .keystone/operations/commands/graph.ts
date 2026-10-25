/**
 * `keystone stone graph [id]`: renders the stone topology.
 */

import { basename } from "node:path";
import type { CommandResult, Context } from "../core/context.ts";
import { buildGraph, graphToJson, impactOf, reachable, renderFocusedAscii, renderFullAscii, renderMermaid } from "../core/graph.ts";
import { scan } from "../core/workspace.ts";
import { KeystoneError, RELATION_KINDS } from "../types.ts";

export interface GraphOptions {
  format?: string;
  depth?: string;
}

const FORMATS = ["ascii", "mermaid", "json"];

export function graph(ctx: Context, id: string | undefined, options: GraphOptions): CommandResult {
  const format = options.format ?? "ascii";
  if (!FORMATS.includes(format)) throw new KeystoneError(`invalid --format '${format}': expected ${FORMATS.join(", ")}`);
  const depth = options.depth === undefined ? 1 : Number(options.depth);
  if (!Number.isInteger(depth) || depth < 1) throw new KeystoneError(`invalid --depth '${options.depth}'`);

  const topology = buildGraph(scan(ctx.root).stones);
  if (id && !topology.nodes.has(id)) throw new KeystoneError(`unknown stone '${id}'. Try 'keystone stone search ${id}'.`);

  let subset: Set<string> | undefined;
  if (id) {
    subset = new Set([id]);
    for (const kind of RELATION_KINDS) for (const other of reachable(topology, id, kind, depth)) subset.add(other);
  }

  if (format === "json") {
    ctx.io.stdout(JSON.stringify(graphToJson(topology, subset), null, 2));
    return 0;
  }
  if (format === "mermaid") {
    ctx.io.stdout(renderMermaid(topology, subset));
    return 0;
  }
  if (id) {
    ctx.io.stdout(renderFocusedAscii(topology, id, depth));
    const impact = impactOf(topology, id, Number.POSITIVE_INFINITY);
    ctx.io.stdout(`\nTransitive impact: ${impact.length > 0 ? impact.join(", ") : "(none)"}`);
    return 0;
  }
  ctx.io.stdout(renderFullAscii(topology, `Key: ${basename(ctx.root)}`));
  return 0;
}
