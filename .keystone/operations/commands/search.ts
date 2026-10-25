/**
 * `keystone stone search [query]`: lexical, metadata-aware search over stones.
 * No embeddings: identifiers, tags, summaries and headings carry the signal.
 */

import type { CommandResult, Context } from "../core/context.ts";
import { headings } from "../core/stone.ts";
import { scan } from "../core/workspace.ts";
import { KeystoneError } from "../types.ts";
import type { Stone } from "../types.ts";

export interface SearchOptions {
  tag?: string;
  type?: string;
  limit?: string;
  json?: boolean;
}

export interface SearchHit {
  stone: Stone;
  score: number;
}

function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

/** Scores a stone against query tokens. Every token must match somewhere (AND semantics). */
export function scoreStone(stone: Stone, tokens: string[]): number {
  const id = (stone.meta.id || stone.fileId).toLowerCase();
  const tags = stone.meta.tags.map((tag) => tag.toLowerCase());
  const summary = stone.meta.summary.toLowerCase();
  const heads = headings(stone.body).map((heading) => heading.toLowerCase());
  const path = stone.relPath.toLowerCase();
  const body = stone.body.toLowerCase();
  let total = 0;
  for (const token of tokens) {
    let score = 0;
    if (id === token) score += 10;
    else if (id.includes(token)) score += 6;
    if (tags.includes(token)) score += 5;
    else if (tags.some((tag) => tag.includes(token))) score += 3;
    if (summary.includes(token)) score += 2;
    if (path.includes(token)) score += 1.5;
    if (heads.some((heading) => heading.includes(token))) score += 1;
    if (body.includes(token)) score += 0.5;
    if (score === 0) return 0;
    total += score;
  }
  return total;
}

export function searchStones(stones: Stone[], query: string, options: SearchOptions): SearchHit[] {
  const tokens = tokenize(query);
  const tag = options.tag?.toLowerCase();
  const filtered = stones.filter(
    (stone) =>
      (!tag || stone.meta.tags.some((item) => item.toLowerCase() === tag)) &&
      (!options.type || stone.meta.type === options.type),
  );
  const hits =
    tokens.length === 0
      ? filtered.map((stone) => ({ stone, score: 0 }))
      : filtered.map((stone) => ({ stone, score: scoreStone(stone, tokens) })).filter((hit) => hit.score > 0);
  return hits.sort((a, b) => b.score - a.score || a.stone.relPath.localeCompare(b.stone.relPath));
}

export function search(ctx: Context, query: string, options: SearchOptions): CommandResult {
  const limit = options.limit === undefined ? Number.POSITIVE_INFINITY : Number(options.limit);
  if (Number.isNaN(limit) || limit < 1) throw new KeystoneError(`invalid --limit '${options.limit}'`);
  const { stones, parseIssues } = scan(ctx.root);
  const hits = searchStones(stones, query, options).slice(0, limit);

  if (options.json) {
    ctx.io.stdout(
      JSON.stringify(
        hits.map(({ stone, score }) => ({
          id: stone.meta.id || stone.fileId,
          type: stone.meta.type,
          path: stone.relPath,
          tags: stone.meta.tags,
          summary: stone.meta.summary,
          score,
        })),
        null,
        2,
      ),
    );
    return hits.length > 0 ? 0 : 1;
  }

  if (hits.length === 0) {
    ctx.io.stdout(query ? `No stones match '${query}'.` : "No stones found. Create one with 'keystone stone create <id> --path <dir>'.");
  }
  for (const { stone } of hits) {
    ctx.io.stdout(`${stone.meta.id || stone.fileId} [${stone.meta.type || "untyped"}] ${stone.relPath}`);
    if (stone.meta.summary) ctx.io.stdout(`    ${stone.meta.summary}`);
    if (stone.meta.tags.length > 0) ctx.io.stdout(`    tags: ${stone.meta.tags.join(", ")}`);
  }
  if (parseIssues.length > 0) {
    ctx.io.stderr(`warning: ${parseIssues.length} stone file(s) could not be parsed; run 'keystone stone doctor'`);
  }
  return hits.length > 0 ? 0 : 1;
}
