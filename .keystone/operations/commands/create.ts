/**
 * `keystone stone create <id> --path <dir>`: scaffolds a new co-located stone.
 */

import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { csv, plural } from "../core/context.ts";
import type { CommandResult, Context } from "../core/context.ts";
import { updateIndex } from "../core/key.ts";
import { STONE_ID_PATTERN, emptyRelations, renderStone, stoneFileName, titleFromId, toPosix, writeStone } from "../core/stone.ts";
import { indexById, keyPath, scan } from "../core/workspace.ts";
import { KeystoneError, STONE_TYPES } from "../types.ts";
import type { StoneMeta } from "../types.ts";

export const DEFAULT_STONE_BODY = `
# {{title}}

## Purpose and Design Decisions

Why this part of the system exists and which technical choices shape it.

## Invariants

Rules that must hold for every change in this scope. Describe them as facts
of the system, with the reason that makes them necessary.

## Integration Contracts

Interfaces, payloads, events and side effects other parts rely on.

## Anti-Patterns

Approaches that look reasonable here but conflict with the design above.
`;

export interface CreateOptions {
  path?: string;
  type?: string;
  tags?: string;
  summary?: string;
  owner?: string;
  "depends-on"?: string;
}

function loadTemplate(root: string): string {
  const path = keyPath(root, "stoneTemplate");
  return existsSync(path) ? readFileSync(path, "utf8") : DEFAULT_STONE_BODY;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => values[key] ?? match);
}

export function create(ctx: Context, id: string | undefined, options: CreateOptions): CommandResult {
  if (!id) throw new KeystoneError("usage: keystone stone create <id> --path <dir> [--type <type>] [--tags a,b] [--summary <text>]");
  if (!STONE_ID_PATTERN.test(id)) {
    throw new KeystoneError(`invalid stone id '${id}': use lowercase letters, digits and dashes (e.g. 'user-service')`);
  }
  const type = options.type ?? "module";
  if (!(STONE_TYPES as readonly string[]).includes(type)) {
    throw new KeystoneError(`invalid type '${type}': expected one of ${STONE_TYPES.join(", ")}`);
  }
  if (!options.path) throw new KeystoneError("missing --path <dir>: stones live next to the code they describe");

  const dir = resolve(ctx.cwd, options.path);
  const relDir = relative(ctx.root, dir);
  if (relDir.startsWith("..") || resolve(ctx.root, relDir) !== dir) {
    throw new KeystoneError(`path '${options.path}' is outside the project root ${ctx.root}`);
  }
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new KeystoneError(`directory '${options.path}' does not exist`);
  }
  if (toPosix(relDir).split("/").some((part) => part.startsWith("."))) {
    throw new KeystoneError(`stones inside hidden directories are not scanned: '${options.path}'`);
  }

  const { stones } = scan(ctx.root);
  const byId = indexById(stones);
  if (byId.has(id)) throw new KeystoneError(`stone '${id}' already exists at ${byId.get(id)?.relPath}`);

  const dependsOn = csv(options["depends-on"]);
  for (const target of dependsOn) {
    if (target === id) throw new KeystoneError("a stone cannot depend on itself");
    if (!byId.has(target)) throw new KeystoneError(`unknown stone '${target}' in --depends-on`);
    const notes = byId.get(target)?.notes ?? [];
    if (notes.length > 0) throw new KeystoneError(`cannot link '${target}': ${notes.join("; ")}`);
  }

  const meta: StoneMeta = {
    id,
    type,
    tags: csv(options.tags),
    relations: { ...emptyRelations(), depends_on: dependsOn },
    owner: options.owner,
    summary: options.summary ?? "",
    extra: {},
  };
  const filePath = join(dir, stoneFileName(id));
  const body = fill(loadTemplate(ctx.root), { id, title: titleFromId(id), type, summary: meta.summary });
  writeFileSync(filePath, renderStone(meta, body.startsWith("\n") ? body : `\n${body}`), "utf8");

  for (const target of dependsOn) {
    const stone = byId.get(target);
    if (stone && !stone.meta.relations.depended_by.includes(id)) {
      stone.meta.relations.depended_by.push(id);
      writeStone(stone);
    }
  }

  const index = updateIndex(ctx.root, scan(ctx.root).stones);
  const relFile = toPosix(relative(ctx.root, filePath));
  ctx.io.stdout(`Created ${relFile}`);
  if (dependsOn.length > 0) ctx.io.stdout(`Linked ${plural(dependsOn.length, "dependency")}: ${dependsOn.join(", ")}`);
  if (index === "updated") ctx.io.stdout("Updated stone index in .keystone/architecture.md");
  if (index === "missing-markers") ctx.io.stderr("warning: .keystone/architecture.md has no index markers; index not updated");
  if (!meta.summary) ctx.io.stdout("Next: fill in 'summary' and the body sections, then run 'keystone stone doctor'.");
  return 0;
}
