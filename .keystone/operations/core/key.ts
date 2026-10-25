/**
 * Key (centralizer) helpers: the generated stone index inside
 * `architecture.md`, template markers and the state checklist.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { keyPath } from "./workspace.ts";
import type { Stone } from "../types.ts";

export const INDEX_START = "<!-- keystone:index:start -->";
export const INDEX_END = "<!-- keystone:index:end -->";
/** Present in Key files that still hold unfilled template content. */
export const TEMPLATE_MARKER = "<!-- keystone:template -->";

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

/** Renders the stone index table placed between the index markers. */
export function renderIndex(stones: Stone[]): string {
  if (stones.length === 0) return "_No stones yet. Create one with `keystone stone create <id> --path <dir>`._";
  const rows = [...stones]
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map(
      (stone) =>
        `| \`${stone.meta.id}\` | ${escapeCell(stone.meta.type)} | [${stone.relDir}](../${stone.relPath}) | ${escapeCell(stone.meta.summary)} |`,
    );
  return ["| Stone | Type | Location | Summary |", "| --- | --- | --- | --- |", ...rows].join("\n");
}

export type IndexUpdate = "updated" | "unchanged" | "missing-file" | "missing-markers";

/** Rewrites the generated index block in `architecture.md`. */
export function updateIndex(root: string, stones: Stone[]): IndexUpdate {
  const path = keyPath(root, "architecture");
  if (!existsSync(path)) return "missing-file";
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(INDEX_START);
  const end = source.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) return "missing-markers";
  const next = `${source.slice(0, start + INDEX_START.length)}\n${renderIndex(stones)}\n${source.slice(end)}`;
  if (next === source) return "unchanged";
  writeFileSync(path, next, "utf8");
  return "updated";
}

/** Returns the identifiers listed in the generated index block, or null when absent. */
export function indexedIds(root: string): Set<string> | null {
  const path = keyPath(root, "architecture");
  if (!existsSync(path)) return null;
  const source = readFileSync(path, "utf8");
  const start = source.indexOf(INDEX_START);
  const end = source.indexOf(INDEX_END);
  if (start === -1 || end === -1 || end < start) return null;
  const block = source.slice(start, end);
  const ids = new Set<string>();
  for (const match of block.matchAll(/^\|\s*`([a-z0-9][a-z0-9-]*)`/gm)) ids.add(match[1]);
  return ids;
}

export function hasTemplateMarker(path: string): boolean {
  return existsSync(path) && readFileSync(path, "utf8").includes(TEMPLATE_MARKER);
}

export type StateStatus = "pending" | "done" | "skipped";

export interface StateItem {
  name: string;
  status: StateStatus;
  line: string;
}

/** Parses the `- [ ] Name` checklist in `state.md`. */
export function readState(root: string): StateItem[] {
  const path = keyPath(root, "state");
  if (!existsSync(path)) return [];
  const items: StateItem[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^\s*-\s*\[([ xX-])\]\s*\*{0,2}([^*(\u2014:]+?)\*{0,2}\s*(?:[(\u2014:].*)?$/.exec(line);
    if (!match) continue;
    const mark = match[1].toLowerCase();
    items.push({
      name: match[2].trim(),
      status: mark === "x" ? "done" : mark === "-" ? "skipped" : "pending",
      line: line.trim(),
    });
  }
  return items;
}
