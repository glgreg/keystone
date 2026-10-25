/**
 * Workspace discovery: locates the project root (the directory holding the
 * Key, `.keystone/`) and scans the tree for co-located stones.
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { FrontmatterError } from "./frontmatter.ts";
import { STONE_FILE_PATTERN, readStone, toPosix } from "./stone.ts";
import type { ScanResult, Stone } from "../types.ts";

export const KEY_DIR = ".keystone";

export const KEY_FILES = {
  protocol: "protocol.md",
  architecture: "architecture.md",
  identity: "identity.md",
  standards: "standards.md",
  state: "state.md",
  stoneTemplate: "templates/stone.md",
} as const;

/**
 * Directories never scanned for stones. Hidden directories (including the Key
 * itself, `.git`, editor folders and caches) are skipped as well.
 */
const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  "target",
  "vendor",
  "coverage",
  "__pycache__",
]);

/** Walks up from `start` until a directory containing `.keystone/` is found. */
export function findProjectRoot(start: string): string | null {
  let current = resolve(start);
  while (true) {
    const candidate = join(current, KEY_DIR);
    if (existsSync(candidate) && statSync(candidate).isDirectory()) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Resolves the project root from an explicit `--root` or by walking up from the cwd. */
export function resolveRoot(explicit: string | undefined, cwd: string): string {
  if (explicit) return resolve(cwd, explicit);
  return findProjectRoot(cwd) ?? resolve(cwd);
}

export function keyPath(root: string, file: keyof typeof KEY_FILES): string {
  return join(root, KEY_DIR, KEY_FILES[file]);
}

export function hasKey(root: string): boolean {
  return existsSync(join(root, KEY_DIR));
}

function collectStonePaths(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (entry.name.startsWith(".") || IGNORED_DIRS.has(entry.name)) continue;
      collectStonePaths(join(dir, entry.name), out);
    } else if (entry.isFile() && STONE_FILE_PATTERN.test(entry.name)) {
      out.push(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.startsWith(".stone.") && entry.name.endsWith(".md")) {
      // Invalid identifiers are still collected so `doctor` can report them.
      out.push(join(dir, entry.name));
    }
  }
}

/** Scans the project for stones. Malformed files are reported, never thrown. */
export function scan(root: string): ScanResult {
  const paths: string[] = [];
  collectStonePaths(root, paths);
  const stones: Stone[] = [];
  const parseIssues: ScanResult["parseIssues"] = [];
  for (const path of paths) {
    try {
      stones.push(readStone(path, root).stone);
    } catch (error) {
      const message = error instanceof FrontmatterError ? error.message : String(error);
      const relPath = toPosix(relative(root, path));
      parseIssues.push({ path, relPath, message });
    }
  }
  return { root, stones, parseIssues };
}

/** Indexes stones by identifier. Duplicates keep the first occurrence (reported by `doctor`). */
export function indexById(stones: Stone[]): Map<string, Stone> {
  const map = new Map<string, Stone>();
  for (const stone of stones) {
    const id = stone.meta.id || stone.fileId;
    if (id && !map.has(id)) map.set(id, stone);
  }
  return map;
}
