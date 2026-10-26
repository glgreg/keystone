/**
 * Test helpers: disposable Keystone projects and in-process CLI execution.
 */

import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { run } from "../.keystone/operations/cli.ts";

export const REPO_ROOT = resolve(import.meta.dir, "..");
export const KEY_SOURCE = join(REPO_ROOT, ".keystone");
export const ENTRY = join(KEY_SOURCE, "operations/stone.ts");

export interface Project {
  root: string;
  write: (rel: string, content: string) => void;
  read: (rel: string) => string;
  cleanup: () => void;
}

/** Creates a temporary project with a fresh copy of the Key. */
export function makeProject(options: { key?: boolean } = {}): Project {
  const root = mkdtempSync(join(tmpdir(), "keystone-test-"));
  if (options.key !== false) cpSync(KEY_SOURCE, join(root, ".keystone"), { recursive: true });
  const write = (rel: string, content: string) => {
    const path = join(root, rel);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content);
  };
  return {
    root,
    write,
    read: (rel) => readFileSync(join(root, rel), "utf8"),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

export interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with captured output. */
export function cli(cwd: string, ...argv: string[]): RunResult {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(argv, { cwd, io: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) } });
  return { code, stdout: out.join("\n"), stderr: err.join("\n") };
}

export function stoneSource(fields: {
  id: string;
  type?: string;
  tags?: string[];
  dependsOn?: string[];
  dependedBy?: string[];
  children?: string[];
  summary?: string;
  body?: string;
}): string {
  const list = (items: string[] = []) => (items.length ? `[${items.join(", ")}]` : "[]");
  return [
    "---",
    `id: ${fields.id}`,
    `type: ${fields.type ?? "module"}`,
    `tags: ${list(fields.tags ?? ["sample"])}`,
    "relations:",
    `  depends_on: ${list(fields.dependsOn)}`,
    `  depended_by: ${list(fields.dependedBy)}`,
    `  children: ${list(fields.children)}`,
    `summary: ${fields.summary ?? `Summary of ${fields.id}.`}`,
    "---",
    fields.body ?? `\n# ${fields.id}\n\n## Invariants\n\n- Something holds.\n`,
  ].join("\n");
}

/**
 * A small, consistent graph:
 *   auth  -> users, cache ; auth children: token-rotation
 *   billing -> users
 */
export function seedGraph(project: Project): void {
  project.write("src/users/repo.ts", "export {};\n");
  project.write("src/auth/jwt.ts", "export {};\n");
  project.write("src/auth/rotation/rotate.ts", "export {};\n");
  project.write("src/cache/redis.ts", "export {};\n");
  project.write("src/billing/webhook.ts", "export {};\n");
  project.write(
    "src/users/.stone.users.md",
    stoneSource({ id: "users", type: "entity", tags: ["users", "postgres"], dependedBy: ["auth", "billing"], summary: "User accounts and profile persistence." }),
  );
  project.write(
    "src/auth/.stone.auth.md",
    stoneSource({
      id: "auth",
      tags: ["authentication", "jwt", "oauth"],
      dependsOn: ["users", "cache"],
      children: ["token-rotation"],
      summary: "Issues and validates JWT access tokens.",
      body: "\n# Auth\n\n## Invariants\n\n- Access tokens expire after 15 minutes.\n",
    }),
  );
  project.write(
    "src/auth/rotation/.stone.token-rotation.md",
    stoneSource({ id: "token-rotation", type: "policy", tags: ["jwt", "refresh"], summary: "Refresh tokens rotate on every use." }),
  );
  project.write(
    "src/cache/.stone.cache.md",
    stoneSource({ id: "cache", type: "service", tags: ["redis"], dependedBy: ["auth"], summary: "Redis-backed cache." }),
  );
  project.write(
    "src/billing/.stone.billing.md",
    stoneSource({ id: "billing", tags: ["payments", "webhook"], dependsOn: ["users"], summary: "Payment webhooks, idempotent by event id." }),
  );
}
