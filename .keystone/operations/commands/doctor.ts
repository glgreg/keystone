/**
 * `keystone stone doctor`: integrity audit of the Key and the stone graph.
 *
 * Exit codes: 0 when healthy, 1 when errors are found (or warnings with
 * `--strict`). `--fix` repairs mechanical issues only: duplicate entries,
 * missing inverse relations and a stale index. It never edits stone bodies.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname } from "node:path";
import { csv, plural } from "../core/context.ts";
import type { CommandResult, Context } from "../core/context.ts";
import { INDEX_END, INDEX_START, TEMPLATE_MARKER, hasTemplateMarker, readState, renderIndex, updateIndex } from "../core/key.ts";
import { STONE_FILE_PATTERN, headings, writeStone } from "../core/stone.ts";
import { KEY_FILES, hasKey, keyPath, scan } from "../core/workspace.ts";
import { loadTemplate } from "./create.ts";
import { INVERSE_RELATION, RELATION_KINDS, STONE_TYPES } from "../types.ts";
import type { Diagnostic, RelationKind, Severity, Stone } from "../types.ts";

export interface DoctorOptions {
  fix?: boolean;
  strict?: boolean;
  json?: boolean;
  ignore?: string;
}

export interface DoctorReport {
  root: string;
  stoneCount: number;
  diagnostics: Diagnostic[];
}

const REQUIRED_KEY_FILES: Array<keyof typeof KEY_FILES> = ["protocol", "architecture", "state"];
const RECOMMENDED_KEY_FILES: Array<keyof typeof KEY_FILES> = ["identity", "standards"];

function checkKey(root: string, push: (d: Diagnostic) => void): void {
  if (!hasKey(root)) {
    push({ severity: "error", code: "key-missing", message: `no .keystone/ directory found at ${root}` });
    return;
  }
  for (const file of REQUIRED_KEY_FILES) {
    if (!existsSync(keyPath(root, file))) {
      push({ severity: "error", code: "key-file-missing", message: `.keystone/${KEY_FILES[file]} is missing` });
    }
  }
  for (const file of RECOMMENDED_KEY_FILES) {
    if (!existsSync(keyPath(root, file))) {
      push({ severity: "warning", code: "key-file-missing", message: `.keystone/${KEY_FILES[file]} is missing` });
    }
  }
  for (const file of ["identity", "architecture", "standards"] as const) {
    if (hasTemplateMarker(keyPath(root, file))) {
      push({
        severity: "warning",
        code: "core-context-template",
        message: `.keystone/${KEY_FILES[file]} still contains template content (remove ${TEMPLATE_MARKER} once filled)`,
      });
    }
  }
  const assumed = readState(root).filter((item) => /\(assumed\b/i.test(item.line));
  if (assumed.length > 0) {
    push({
      severity: "info",
      code: "state-assumed",
      message: `set up without the user's confirmation, review when possible: ${assumed.map((item) => item.name).join(", ")}`,
    });
  }
  const pending = readState(root).filter((item) => item.status === "pending");
  if (pending.length > 0) {
    push({
      severity: "info",
      code: "state-pending",
      message: `activation pending in .keystone/state.md: ${pending.map((item) => item.name).join(", ")}`,
    });
  }
}

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

/** The guidance paragraphs of the stone template: the text a filled stone replaces. */
function templateGuidance(root: string): string[] {
  return loadTemplate(root)
    .split(/\n\s*\n/)
    .map(normalize)
    .filter((paragraph) => paragraph && !paragraph.startsWith("#") && !paragraph.includes("{{"));
}

function hasCoLocatedSource(stone: Stone): boolean {
  try {
    return readdirSync(dirname(stone.path)).some((name) => !name.startsWith("."));
  } catch {
    return false;
  }
}

export function diagnose(root: string): DoctorReport {
  const diagnostics: Diagnostic[] = [];
  const push = (d: Diagnostic) => diagnostics.push(d);
  checkKey(root, push);

  const { stones, parseIssues } = scan(root);
  for (const issue of parseIssues) {
    push({ severity: "error", code: "parse-error", message: issue.message, path: issue.relPath });
  }

  const byId = new Map<string, Stone[]>();
  for (const stone of stones) {
    const id = stone.meta.id || stone.fileId;
    byId.set(id, [...(byId.get(id) ?? []), stone]);
  }

  const guidance = templateGuidance(root);
  for (const stone of stones) {
    const at = { stone: stone.meta.id || stone.fileId, path: stone.relPath };
    const { meta } = stone;
    if (!STONE_FILE_PATTERN.test(stone.relPath.split("/").pop() ?? "")) {
      push({ severity: "error", code: "invalid-filename", message: "filename must match .stone.<id>.md with a lowercase kebab-case id", ...at });
    }
    for (const note of stone.notes) push({ severity: "error", code: "invalid-frontmatter", message: note, ...at });
    if (!meta.id) push({ severity: "error", code: "missing-id", message: "frontmatter has no 'id'", ...at });
    else if (stone.fileId && meta.id !== stone.fileId) {
      push({ severity: "error", code: "id-mismatch", message: `frontmatter id '${meta.id}' does not match filename id '${stone.fileId}'`, ...at });
    }
    if (!meta.type) push({ severity: "error", code: "missing-type", message: "frontmatter has no 'type'", ...at });
    else if (!(STONE_TYPES as readonly string[]).includes(meta.type)) {
      push({ severity: "warning", code: "unknown-type", message: `type '${meta.type}' is not one of ${STONE_TYPES.join(", ")}`, ...at });
    }
    if (!meta.summary.trim()) push({ severity: "error", code: "missing-summary", message: "frontmatter has no 'summary'", ...at });
    if (meta.tags.length === 0) push({ severity: "warning", code: "missing-tags", message: "no tags declared; search quality degrades", ...at });
    const leftover = guidance.filter((paragraph) => normalize(stone.body).includes(paragraph)).length;
    if (guidance.length > 0 && leftover === guidance.length) {
      push({ severity: "error", code: "unfilled-stone", message: "body is still the template; describe this module from its code", ...at });
    } else if (leftover > 0) {
      push({ severity: "warning", code: "template-text", message: `${plural(leftover, "section still holds", "sections still hold")} template guidance text`, ...at });
    }
    if (!stone.body.trim()) push({ severity: "warning", code: "empty-body", message: "body is empty; document purpose and invariants", ...at });
    else if (!headings(stone.body).some((heading) => /invariant/i.test(heading))) {
      push({ severity: "info", code: "missing-invariants", message: "no 'Invariants' section found", ...at });
    }
    if (!hasCoLocatedSource(stone)) {
      push({ severity: "warning", code: "no-co-located-source", message: `directory '${stone.relDir}' has no visible files; was the module moved or removed?`, ...at });
    }

    for (const kind of RELATION_KINDS) {
      const targets = meta.relations[kind];
      const seen = new Set<string>();
      for (const target of targets) {
        if (seen.has(target)) {
          push({ severity: "warning", code: "duplicate-relation", message: `${kind} lists '${target}' more than once`, fixable: true, ...at });
          continue;
        }
        seen.add(target);
        if (target === meta.id) {
          push({ severity: "error", code: "self-relation", message: `${kind} references the stone itself`, ...at });
          continue;
        }
        const other = byId.get(target)?.[0];
        if (!other) {
          push({ severity: "error", code: "broken-relation", message: `${kind} references unknown stone '${target}'`, ...at });
          continue;
        }
        const inverse = INVERSE_RELATION[kind];
        if (inverse && !other.meta.relations[inverse].includes(meta.id)) {
          push({
            severity: "warning",
            code: "asymmetric-relation",
            message: `${kind} '${target}' but '${target}' does not declare ${inverse} '${meta.id}'`,
            fixable: true,
            ...at,
          });
        }
      }
    }

    const relationCount = RELATION_KINDS.reduce((sum, kind) => sum + meta.relations[kind].length, 0);
    const referenced = stones.some((other) => other !== stone && RELATION_KINDS.some((kind) => other.meta.relations[kind].includes(meta.id)));
    if (stones.length > 1 && relationCount === 0 && !referenced) {
      push({ severity: "info", code: "isolated", message: "stone has no relations to the rest of the graph", ...at });
    }
  }

  for (const [id, group] of byId) {
    if (id && group.length > 1) {
      push({ severity: "error", code: "duplicate-id", message: `id '${id}' is declared by ${group.map((s) => s.relPath).join(", ")}` });
    }
  }

  const architecture = keyPath(root, "architecture");
  if (existsSync(architecture)) {
    const source = readFileSync(architecture, "utf8");
    const start = source.indexOf(INDEX_START);
    const end = source.indexOf(INDEX_END);
    if (start === -1 || end === -1 || end < start) {
      push({ severity: "warning", code: "index-markers-missing", message: `.keystone/architecture.md has no ${INDEX_START} / ${INDEX_END} block` });
    } else {
      const current = source.slice(start + INDEX_START.length, end).trim();
      if (current !== renderIndex(stones).trim()) {
        push({ severity: "warning", code: "stale-index", message: "stone index in .keystone/architecture.md is out of date", fixable: true });
      }
    }
  }

  if (stones.length === 0 && parseIssues.length === 0) {
    push({ severity: "info", code: "no-stones", message: "no stones found yet; map the main modules with 'keystone stone create'" });
  }

  return { root, stoneCount: stones.length + parseIssues.length, diagnostics };
}

/** Applies mechanical fixes. Returns a description of each change. */
export function applyFixes(root: string): string[] {
  const changes: string[] = [];
  const { stones } = scan(root);
  const byId = new Map<string, Stone>();
  for (const stone of stones) if (stone.meta.id && !byId.has(stone.meta.id)) byId.set(stone.meta.id, stone);
  const dirty = new Set<Stone>();

  for (const stone of stones) {
    if (stone.notes.length > 0) continue;
    for (const kind of RELATION_KINDS) {
      const unique = [...new Set(stone.meta.relations[kind])];
      if (unique.length !== stone.meta.relations[kind].length) {
        stone.meta.relations[kind] = unique;
        dirty.add(stone);
        changes.push(`${stone.meta.id}: removed duplicate ${kind} entries`);
      }
    }
  }
  for (const stone of stones) {
    if (stone.notes.length > 0) continue;
    for (const kind of RELATION_KINDS) {
      const inverse = INVERSE_RELATION[kind] as RelationKind | undefined;
      if (!inverse) continue;
      for (const target of stone.meta.relations[kind]) {
        const other = byId.get(target);
        if (!other || other === stone || other.notes.length > 0) continue;
        if (!other.meta.relations[inverse].includes(stone.meta.id)) {
          other.meta.relations[inverse].push(stone.meta.id);
          dirty.add(other);
          changes.push(`${other.meta.id}: added ${inverse} '${stone.meta.id}'`);
        }
      }
    }
  }
  for (const stone of dirty) writeStone(stone);
  if (updateIndex(root, scan(root).stones) === "updated") changes.push("regenerated stone index in .keystone/architecture.md");
  return changes;
}

const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function doctor(ctx: Context, options: DoctorOptions): CommandResult {
  const fixes = options.fix ? applyFixes(ctx.root) : [];
  const ignored = new Set(csv(options.ignore));
  const report = diagnose(ctx.root);
  const diagnostics = report.diagnostics
    .filter((d) => !ignored.has(d.code))
    .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.path ?? "").localeCompare(b.path ?? ""));
  const count = (severity: Severity) => diagnostics.filter((d) => d.severity === severity).length;
  const errors = count("error");
  const warnings = count("warning");
  const failed = errors > 0 || (options.strict === true && warnings > 0);

  if (options.json) {
    ctx.io.stdout(JSON.stringify({ root: report.root, stones: report.stoneCount, fixes, diagnostics, healthy: !failed }, null, 2));
    return failed ? 1 : 0;
  }

  ctx.io.stdout(`Keystone doctor: ${report.root}`);
  ctx.io.stdout(`${plural(report.stoneCount, "stone")} scanned`);
  for (const change of fixes) ctx.io.stdout(`fixed    ${change}`);
  for (const d of diagnostics) {
    const location = d.path ? ` (${d.path})` : "";
    const subject = d.stone ? `${d.stone}: ` : "";
    ctx.io.stdout(`${d.severity.padEnd(8)} ${d.code.padEnd(24)} ${subject}${d.message}${location}${d.fixable ? " [fixable]" : ""}`);
  }
  const fixable = diagnostics.filter((d) => d.fixable).length;
  ctx.io.stdout(
    `Summary: ${plural(errors, "error")}, ${plural(warnings, "warning")}, ${plural(count("info"), "info")}` +
      (fixable > 0 ? `; ${fixable} fixable with --fix` : ""),
  );
  ctx.io.stdout(failed ? "Status: unhealthy" : "Status: healthy");
  return failed ? 1 : 0;
}
