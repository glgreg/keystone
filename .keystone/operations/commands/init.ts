/**
 * `keystone init`: installs or updates the Key in a project.
 *
 * Idempotent. Files the project owns (identity, architecture, standards,
 * state, stone template) are created only when missing. Files Keystone owns
 * (protocol and tooling) are refreshed on every run, so re-running `init`
 * from a newer package upgrades them. The agent instruction files the project
 * already has receive a short pointer to the protocol (AGENTS.md is created
 * when there are none).
 */

import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandResult, Io } from "../core/context.ts";
import { KEY_DIR, KEY_FILES } from "../core/workspace.ts";
import { KeystoneError } from "../types.ts";

export interface InitOptions {
  root?: string;
}

/** Created when missing, never overwritten: their content belongs to the project. */
const PROJECT_FILES = [KEY_FILES.identity, KEY_FILES.architecture, KEY_FILES.standards, KEY_FILES.state, KEY_FILES.stoneTemplate];

/** Refreshed on every run: their content belongs to Keystone. */
const MANAGED_FILES = [KEY_FILES.protocol, "bin/keystone"];

/**
 * Instruction files read by common agents. The pointer goes into those present.
 * Without any, init creates AGENTS.md (read by most agents) and a CLAUDE.md
 * that imports it, since Claude Code reads only CLAUDE.md.
 */
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md"];
const CLAUDE_IMPORT = "@AGENTS.md\n";

export const POINTER = `## Keystone

This project uses Keystone for architectural context. Before planning or changing code, read \`.keystone/protocol.md\` and follow it.
`;

interface Source {
  /** The packaged `.keystone/` directory holding the template Key. */
  keyDir: string;
  /** The running CLI: a single bundled file, or the TypeScript sources. */
  tooling: { kind: "bundle"; file: string } | { kind: "sources"; dir: string };
}

function locateSource(): Source {
  const self = fileURLToPath(import.meta.url);
  if (basename(dirname(self)) === "dist") {
    // Published package: <pkg>/dist/keystone.js next to <pkg>/.keystone/
    return { keyDir: join(dirname(dirname(self)), KEY_DIR), tooling: { kind: "bundle", file: self } };
  }
  // Sources: <repo>/.keystone/operations/commands/init.ts
  const operations = dirname(dirname(self));
  return { keyDir: dirname(operations), tooling: { kind: "sources", dir: operations } };
}

/** The project root is the enclosing Git repository, or the directory itself outside Git. */
function findTargetRoot(cwd: string): string {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}

/** True when the file mentions the protocol, or imports (`@file`) another instruction file that does. */
function hasPointer(root: string, file: string, seen = new Set<string>()): boolean {
  const path = join(root, file);
  if (seen.has(file) || !existsSync(path)) return false;
  seen.add(file);
  const content = readFileSync(path, "utf8");
  if (content.includes(".keystone/protocol.md")) return true;
  return INSTRUCTION_FILES.some(
    (other) => other !== file && new RegExp(`(^|\\s)@(\\./)?${other.replace(/[.]/g, "\\.")}\\b`, "m").test(content) && hasPointer(root, other, seen),
  );
}

function ensurePointer(root: string, file: string): boolean {
  if (hasPointer(root, file)) return false;
  const path = join(root, file);
  const current = existsSync(path) ? readFileSync(path, "utf8") : "";
  const separator = current === "" ? "" : current.endsWith("\n\n") ? "" : current.endsWith("\n") ? "\n" : "\n\n";
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${current}${separator}${POINTER}`);
  return true;
}

export function init(cwd: string, io: Io, options: InitOptions): CommandResult {
  const root = options.root ? resolve(cwd, options.root) : findTargetRoot(cwd);
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new KeystoneError(`not a directory: ${root}`);

  const source = locateSource();
  if (!existsSync(join(source.keyDir, KEY_FILES.protocol))) {
    throw new KeystoneError(
      "the Key templates were not found next to this CLI. Run init from the npm package (npx @glgreg/keystone init) or from a Keystone checkout.",
    );
  }
  const target = join(root, KEY_DIR);
  if (resolve(target) === resolve(source.keyDir)) throw new KeystoneError("this is the Keystone source repository; init targets other projects.");

  const fresh = !existsSync(target);
  const created: string[] = [];
  const updated: string[] = [];

  for (const file of PROJECT_FILES) {
    const to = join(target, file);
    if (existsSync(to)) continue;
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(source.keyDir, file), to);
    created.push(`${KEY_DIR}/${file}`);
  }
  for (const file of MANAGED_FILES) {
    const to = join(target, file);
    (existsSync(to) ? updated : created).push(`${KEY_DIR}/${file}`);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(join(source.keyDir, file), to);
  }
  chmodSync(join(target, "bin/keystone"), 0o755);

  if (source.tooling.kind === "bundle") {
    const to = join(target, "bin/keystone.js");
    (existsSync(to) ? updated : created).push(`${KEY_DIR}/bin/keystone.js`);
    copyFileSync(source.tooling.file, to);
  } else {
    const to = join(target, "operations");
    (existsSync(to) ? updated : created).push(`${KEY_DIR}/operations/`);
    cpSync(source.tooling.dir, to, { recursive: true });
  }

  const pointers: string[] = [];
  const present = INSTRUCTION_FILES.filter((file) => existsSync(join(root, file)));
  if (present.length === 0) {
    ensurePointer(root, "AGENTS.md");
    writeFileSync(join(root, "CLAUDE.md"), CLAUDE_IMPORT);
    pointers.push("AGENTS.md", "CLAUDE.md (imports AGENTS.md)");
  } else {
    pointers.push(...present.filter((file) => ensurePointer(root, file)));
  }

  io.stdout(`${fresh ? "Installed" : "Updated"} Keystone in ${root}`);
  for (const path of created) io.stdout(`  created  ${path}`);
  for (const path of updated) io.stdout(`  updated  ${path}`);
  for (const file of pointers) io.stdout(`  pointer  ${file}`);
  io.stdout("");
  io.stdout(
    fresh
      ? "Next: activate it. Agents: follow section 6 (Activation) of .keystone/protocol.md now. People: ask your agent to \"Activate the Keystone protocol\"."
      : "Your project files (identity, architecture, standards, state, stones) were left untouched.",
  );
  return 0;
}
