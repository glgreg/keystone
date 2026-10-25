/**
 * Graph construction and rendering (ASCII, Mermaid, JSON).
 *
 * The filesystem gives a tree for navigation; relations give the real graph.
 * `children` builds the navigation hierarchy, `depends_on` / `depended_by`
 * describe coupling and impact.
 */

import { RELATION_KINDS } from "../types.ts";
import type { Graph, GraphEdge, RelationKind, Stone } from "../types.ts";
import { indexById } from "./workspace.ts";

export function buildGraph(stones: Stone[]): Graph {
  const nodes = indexById(stones);
  const edges: GraphEdge[] = [];
  for (const [id, stone] of nodes) {
    for (const kind of RELATION_KINDS) {
      for (const target of stone.meta.relations[kind]) edges.push({ from: id, to: target, kind });
    }
  }
  return { nodes, edges };
}

const LABELS: Record<RelationKind, string> = {
  depends_on: "depends on",
  depended_by: "depended by",
  children: "children",
};

function describe(graph: Graph, id: string): string {
  const stone = graph.nodes.get(id);
  if (!stone) return `${id} (missing)`;
  return `${id} [${stone.meta.type || "untyped"}] ${stone.relDir}`;
}

/** Returns identifiers that are not declared as a child of any other stone. */
export function navigationRoots(graph: Graph): string[] {
  const childIds = new Set(graph.edges.filter((edge) => edge.kind === "children").map((edge) => edge.to));
  return [...graph.nodes.keys()].filter((id) => !childIds.has(id)).sort();
}

/** Collects identifiers reachable from `start` along `kind`, up to `depth` hops. */
export function reachable(graph: Graph, start: string, kind: RelationKind, depth: number): string[] {
  const seen = new Set<string>([start]);
  let frontier = [start];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const target of graph.nodes.get(id)?.meta.relations[kind] ?? []) {
        if (!seen.has(target)) {
          seen.add(target);
          next.push(target);
        }
      }
    }
    frontier = next;
  }
  seen.delete(start);
  return [...seen];
}

/**
 * Identifiers impacted by a change to `start`: stones that depend on it,
 * transitively. Uses both declared directions so asymmetric data still counts.
 */
export function impactOf(graph: Graph, start: string, depth: number): string[] {
  const dependents = new Map<string, Set<string>>();
  const add = (target: string, source: string) => {
    if (!dependents.has(target)) dependents.set(target, new Set());
    dependents.get(target)?.add(source);
  };
  for (const edge of graph.edges) {
    if (edge.kind === "depends_on") add(edge.to, edge.from);
    if (edge.kind === "depended_by") add(edge.from, edge.to);
  }
  const seen = new Set<string>([start]);
  let frontier = [start];
  for (let level = 0; level < depth && frontier.length > 0; level++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const source of dependents.get(id) ?? []) {
        if (!seen.has(source)) {
          seen.add(source);
          next.push(source);
        }
      }
    }
    frontier = next;
  }
  seen.delete(start);
  return [...seen].sort();
}

function renderBranch(
  graph: Graph,
  id: string,
  kind: RelationKind,
  depth: number,
  prefix: string,
  path: Set<string>,
  out: string[],
): void {
  const targets = graph.nodes.get(id)?.meta.relations[kind] ?? [];
  targets.forEach((target, index) => {
    const last = index === targets.length - 1;
    const cycle = path.has(target);
    out.push(`${prefix}${last ? "└── " : "├── "}${describe(graph, target)}${cycle ? " (cycle)" : ""}`);
    if (!cycle && depth > 1 && graph.nodes.has(target)) {
      const nextPath = new Set(path);
      nextPath.add(target);
      renderBranch(graph, target, kind, depth - 1, `${prefix}${last ? "    " : "│   "}`, nextPath, out);
    }
  });
}

/** Focused ASCII view of a single stone and its relations. */
export function renderFocusedAscii(graph: Graph, id: string, depth: number): string {
  const stone = graph.nodes.get(id);
  const out: string[] = [describe(graph, id)];
  if (stone?.meta.summary) out.push(`    ${stone.meta.summary}`);
  const kinds = RELATION_KINDS.filter((kind) => (stone?.meta.relations[kind].length ?? 0) > 0);
  kinds.forEach((kind, index) => {
    const last = index === kinds.length - 1;
    out.push(`${last ? "└── " : "├── "}${LABELS[kind]}`);
    renderBranch(graph, id, kind, depth, last ? "    " : "│   ", new Set([id]), out);
  });
  if (kinds.length === 0) out.push("└── (no relations)");
  return out.join("\n");
}

/** Full ASCII view: navigation tree (children) annotated with dependencies. */
export function renderFullAscii(graph: Graph, title: string): string {
  const out: string[] = [`${title} (${graph.nodes.size} stone${graph.nodes.size === 1 ? "" : "s"})`];
  const visited = new Set<string>();
  const walk = (id: string, prefix: string, last: boolean) => {
    const stone = graph.nodes.get(id);
    const repeated = visited.has(id);
    out.push(`${prefix}${last ? "└── " : "├── "}${describe(graph, id)}${repeated ? " (see above)" : ""}`);
    if (repeated || !stone) return;
    visited.add(id);
    const childPrefix = `${prefix}${last ? "    " : "│   "}`;
    const deps = stone.meta.relations.depends_on;
    const children = stone.meta.relations.children;
    if (deps.length > 0) {
      out.push(`${childPrefix}${children.length > 0 ? "│   " : "    "}depends on: ${deps.join(", ")}`);
    }
    children.forEach((child, index) => walk(child, childPrefix, index === children.length - 1));
  };
  const roots = navigationRoots(graph);
  // Stones only reachable through `children` cycles have no root; list them last.
  const reach = new Set<string>();
  const stack = [...roots];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (reach.has(id)) continue;
    reach.add(id);
    stack.push(...(graph.nodes.get(id)?.meta.relations.children ?? []));
  }
  const tops = [...roots, ...[...graph.nodes.keys()].filter((id) => !reach.has(id)).sort()];
  tops.forEach((id, index) => walk(id, "", index === tops.length - 1));
  if (graph.nodes.size === 0) out.push("└── (no stones found)");
  return out.join("\n");
}

function mermaidId(id: string): string {
  return `s_${id.replace(/-/g, "_")}`;
}

/** Mermaid flowchart. `ids` restricts the rendered subgraph when provided. */
export function renderMermaid(graph: Graph, ids?: Set<string>): string {
  const include = (id: string) => !ids || ids.has(id);
  const out = ["flowchart TD"];
  const declared = new Set<string>();
  // Not named `declare`: transpilers erase `declare(...)` statements as ambient declarations.
  const addNode = (id: string) => {
    if (declared.has(id)) return;
    declared.add(id);
    const stone = graph.nodes.get(id);
    const label = stone ? `${id} (${stone.meta.type || "untyped"})` : `${id} (missing)`;
    out.push(`  ${mermaidId(id)}["${label}"]`);
  };
  for (const id of [...graph.nodes.keys()].sort()) if (include(id)) addNode(id);
  const seen = new Set<string>();
  for (const edge of graph.edges) {
    if (!include(edge.from) && !include(edge.to)) continue;
    let from = edge.from;
    let to = edge.to;
    let kind = edge.kind;
    if (kind === "depended_by") {
      from = edge.to;
      to = edge.from;
      kind = "depends_on";
    }
    const key = `${from}|${to}|${kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addNode(from);
    addNode(to);
    out.push(
      kind === "children"
        ? `  ${mermaidId(from)} -.->|child| ${mermaidId(to)}`
        : `  ${mermaidId(from)} -->|depends on| ${mermaidId(to)}`,
    );
  }
  return out.join("\n");
}

export function graphToJson(graph: Graph, ids?: Set<string>): object {
  const include = (id: string) => !ids || ids.has(id);
  return {
    nodes: [...graph.nodes.values()]
      .filter((stone) => include(stone.meta.id || stone.fileId))
      .map((stone) => ({
        id: stone.meta.id || stone.fileId,
        type: stone.meta.type,
        tags: stone.meta.tags,
        summary: stone.meta.summary,
        path: stone.relPath,
      })),
    edges: graph.edges.filter((edge) => include(edge.from) || include(edge.to)),
  };
}
