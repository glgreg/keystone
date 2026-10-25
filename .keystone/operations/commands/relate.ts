/**
 * `keystone stone relate <source> <target>`: links (or unlinks) two stones and
 * keeps the inverse relation in sync.
 */

import type { CommandResult, Context } from "../core/context.ts";
import { writeStone } from "../core/stone.ts";
import { indexById, scan } from "../core/workspace.ts";
import { INVERSE_RELATION, KeystoneError, RELATION_KINDS } from "../types.ts";
import type { RelationKind, Stone } from "../types.ts";

export interface RelateOptions {
  type?: string;
  remove?: boolean;
}

function toggle(stone: Stone, kind: RelationKind, target: string, remove: boolean): boolean {
  const list = stone.meta.relations[kind];
  const present = list.includes(target);
  if (remove && present) {
    stone.meta.relations[kind] = list.filter((item) => item !== target);
    return true;
  }
  if (!remove && !present) {
    list.push(target);
    return true;
  }
  return false;
}

export function relate(ctx: Context, source: string | undefined, target: string | undefined, options: RelateOptions): CommandResult {
  if (!source || !target) {
    throw new KeystoneError("usage: keystone stone relate <source> <target> [--type depends_on|depended_by|children] [--remove]");
  }
  const kind = (options.type ?? "depends_on") as RelationKind;
  if (!(RELATION_KINDS as readonly string[]).includes(kind)) {
    throw new KeystoneError(`invalid relation type '${options.type}': expected one of ${RELATION_KINDS.join(", ")}`);
  }
  if (source === target) throw new KeystoneError("a stone cannot relate to itself");

  const byId = indexById(scan(ctx.root).stones);
  const from = byId.get(source);
  const to = byId.get(target);
  if (!from) throw new KeystoneError(`unknown stone '${source}'`);
  if (!to) throw new KeystoneError(`unknown stone '${target}'`);
  for (const stone of [from, to]) {
    if (stone.notes.length > 0) throw new KeystoneError(`cannot rewrite ${stone.relPath}: ${stone.notes.join("; ")}`);
  }

  const remove = options.remove === true;
  const inverse = INVERSE_RELATION[kind];
  const changedFrom = toggle(from, kind, target, remove);
  const changedTo = inverse ? toggle(to, inverse, source, remove) : false;
  if (changedFrom) writeStone(from);
  if (changedTo) writeStone(to);

  const verb = remove ? "Removed" : "Linked";
  const label = kind.replace("_", " ");
  if (!changedFrom && !changedTo) {
    ctx.io.stdout(`No change: '${source}' ${remove ? "does not have" : "already has"} ${label} '${target}'.`);
    return 0;
  }
  ctx.io.stdout(`${verb}: ${source} ${label} ${target}`);
  if (inverse && changedTo) ctx.io.stdout(`${verb} inverse: ${target} ${inverse.replace("_", " ")} ${source}`);
  return 0;
}
