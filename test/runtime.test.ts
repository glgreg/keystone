/**
 * Runtime parity: the same sources must work through Bun, Node (native type
 * stripping), the POSIX shim and a compiled standalone binary.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENTRY, KEY_SOURCE, REPO_ROOT, makeProject, seedGraph } from "./helpers.ts";
import type { Project } from "./helpers.ts";

let project: Project;
let buildDir: string;

beforeAll(() => {
  project = makeProject();
  seedGraph(project);
  buildDir = mkdtempSync(join(tmpdir(), "keystone-build-"));
});

afterAll(() => {
  project.cleanup();
  rmSync(buildDir, { recursive: true, force: true });
});

function exec(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
  const result = spawnSync(command, args, { cwd: project.root, encoding: "utf8", env });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function searchIds(stdout: string): string[] {
  return JSON.parse(stdout).map((hit: { id: string }) => hit.id);
}

describe("runtime parity", () => {
  test("bun runs the TypeScript entry directly", () => {
    const result = exec("bun", [ENTRY, "stone", "search", "jwt", "--json"]);
    expect(result.code).toBe(0);
    expect(searchIds(result.stdout).sort()).toEqual(["auth", "token-rotation"]);
  });

  test("node runs the same sources through native type stripping", () => {
    const result = exec("node", ["--no-warnings", ENTRY, "stone", "search", "jwt", "--json"]);
    expect(result.stderr).toBe("");
    expect(result.code).toBe(0);
    expect(searchIds(result.stdout).sort()).toEqual(["auth", "token-rotation"]);
  });

  test("bun and node produce identical output for every read-only command", () => {
    const commands = [
      ["graph"],
      ["graph", "--format", "mermaid"],
      ["graph", "auth", "--depth", "2"],
      ["show", "auth"],
      ["search", "jwt"],
      ["doctor", "--json"],
    ];
    for (const args of commands) {
      const viaBun = exec("bun", [ENTRY, "stone", ...args]);
      const viaNode = exec("node", ["--no-warnings", ENTRY, "stone", ...args]);
      expect({ args, out: viaNode.stdout, code: viaNode.code }).toEqual({ args, out: viaBun.stdout, code: viaBun.code });
    }
  });

  test("the POSIX shim resolves a runtime and forwards exit codes", () => {
    const shim = join(KEY_SOURCE, "bin/keystone");
    expect(exec(shim, ["stone", "doctor"]).code).toBe(0);
    expect(exec(shim, ["stone", "search", "nothing-matches-this"]).code).toBe(1);
  });

  test("the shim falls back to node when bun is not on PATH", () => {
    const isolated = join(buildDir, "path-node-only");
    mkdirSync(isolated, { recursive: true });
    for (const tool of ["node", "dirname"]) {
      const target = spawnSync("sh", ["-c", `command -v ${tool}`], { encoding: "utf8" }).stdout.trim();
      symlinkSync(target, join(isolated, tool));
    }
    const result = exec(join(KEY_SOURCE, "bin/keystone"), ["stone", "search", "jwt", "--json"], { ...process.env, PATH: isolated });
    expect(result.code).toBe(0);
    expect(searchIds(result.stdout).sort()).toEqual(["auth", "token-rotation"]);
  });

  test("the shim explains how to recover when no runtime exists", () => {
    const empty = join(buildDir, "path-empty");
    mkdirSync(empty, { recursive: true });
    symlinkSync(spawnSync("sh", ["-c", "command -v dirname"], { encoding: "utf8" }).stdout.trim(), join(empty, "dirname"));
    const result = exec(join(KEY_SOURCE, "bin/keystone"), ["--version"], { ...process.env, PATH: empty });
    expect(result.code).toBe(127);
    expect(result.stderr).toContain("read .stone.*.md files directly");
  });

  test(
    "bun build --compile produces a standalone binary",
    () => {
      // Built on the repository filesystem: Bun 1.2.22 emits corrupt binaries on tmpfs.
      const outDir = join(REPO_ROOT, "testes/.build");
      mkdirSync(outDir, { recursive: true });
      const outfile = join(outDir, "keystone");
      const build = spawnSync("bun", ["build", "--compile", ENTRY, "--outfile", outfile], { encoding: "utf8" });
      expect(build.status).toBe(0);
      expect(existsSync(outfile)).toBe(true);
      const result = exec(outfile, ["stone", "graph", "users", "--format", "json"], { PATH: "" });
      expect(result.code).toBe(0);
      expect(JSON.parse(result.stdout).nodes.map((n: { id: string }) => n.id).sort()).toEqual(["auth", "billing", "users"]);
      rmSync(outDir, { recursive: true, force: true });
    },
    120_000,
  );
});
