import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cli, makeProject, stoneSource } from "./helpers.ts";
import type { Project } from "./helpers.ts";

let project: Project;
afterEach(() => project?.cleanup());

function bare(): Project {
  project = makeProject({ key: false });
  mkdirSync(join(project.root, ".git"));
  return project;
}

describe("init", () => {
  test("installs the Key, the CLI and an AGENTS.md pointer in a fresh project", () => {
    const p = bare();
    p.write("src/app.ts", "export {};\n");
    const result = cli(join(p.root, "src"), "init");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Installed Keystone in ${p.root}`);
    for (const file of ["protocol.md", "identity.md", "architecture.md", "standards.md", "state.md", "templates/stone.md", "bin/keystone", "operations/stone.ts"]) {
      expect(existsSync(join(p.root, ".keystone", file))).toBe(true);
    }
    expect(p.read("AGENTS.md")).toContain(".keystone/protocol.md");
    expect(p.read("CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(cli(p.root, "doctor").code).toBe(0);
  });

  test("re-running keeps project files and does not duplicate pointers", () => {
    const p = bare();
    p.write("CLAUDE.md", "# Notes\n\nExisting rules.\n");
    cli(p.root, "init");
    p.write(".keystone/identity.md", "# Identity\n\nFilled in.\n");
    p.write(".keystone/protocol.md", "stale");
    const again = cli(p.root, "init");
    expect(again.stdout).toContain("Updated Keystone");
    expect(p.read(".keystone/identity.md")).toBe("# Identity\n\nFilled in.\n");
    expect(p.read(".keystone/protocol.md")).not.toBe("stale");
    expect(p.read("CLAUDE.md").startsWith("# Notes\n\nExisting rules.\n\n## Keystone")).toBe(true);
    expect(p.read("CLAUDE.md").split(".keystone/protocol.md").length - 1).toBe(1);
    expect(existsSync(join(p.root, "AGENTS.md"))).toBe(false);
  });

  test("without instruction files, creates AGENTS.md and a CLAUDE.md that imports it", () => {
    const p = bare();
    cli(p.root, "init");
    expect(p.read("CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(existsSync(join(p.root, "GEMINI.md"))).toBe(false);
    cli(p.root, "init");
    expect(p.read("CLAUDE.md")).toBe("@AGENTS.md\n");
    expect(p.read("AGENTS.md").split(".keystone/protocol.md").length - 1).toBe(1);
  });

  test("files importing each other without a pointer do not loop", () => {
    const p = bare();
    p.write("AGENTS.md", "@CLAUDE.md\n");
    p.write("CLAUDE.md", "@AGENTS.md\n");
    expect(cli(p.root, "init").code).toBe(0);
    expect(p.read("AGENTS.md")).toContain(".keystone/protocol.md");
    expect(p.read("CLAUDE.md")).toBe("@AGENTS.md\n");
  });
});

describe("nested projects", () => {
  test("a subdirectory with its own Key is a separate graph", () => {
    project = makeProject();
    const p = project;
    p.write("src/a/.stone.a.md", stoneSource({ id: "a", tags: ["x"] }));
    p.write("src/a/index.ts", "export {};\n");
    mkdirSync(join(p.root, "vendor-app/.keystone"), { recursive: true });
    p.write("vendor-app/src/b/.stone.b.md", stoneSource({ id: "b", tags: ["x"] }));
    const listing = cli(p.root, "search");
    expect(listing.stdout).toContain("a [module]");
    expect(listing.stdout).not.toContain("b [module]");
  });
});

describe("activation quality checks", () => {
  test("doctor reports stones that still hold the template", () => {
    project = makeProject();
    const p = project;
    p.write("src/auth/index.ts", "export {};\n");
    cli(p.root, "create", "auth", "--path", "src/auth", "--tags", "x", "--summary", "Auth.");
    const unfilled = cli(p.root, "doctor");
    expect(unfilled.code).toBe(1);
    expect(unfilled.stdout).toContain("unfilled-stone");

    const stone = p.read("src/auth/.stone.auth.md");
    p.write("src/auth/.stone.auth.md", stone.replace("Why this part of the system exists and which technical choices shape it.", "Issues JWTs."));
    const partial = cli(p.root, "doctor");
    expect(partial.code).toBe(0);
    expect(partial.stdout).toContain("template-text");
    expect(partial.stdout).not.toContain("unfilled-stone");
  });

  test("create refuses directories the scanner skips", () => {
    project = makeProject();
    project.write("dist/index.js", "\n");
    const result = cli(project.root, "create", "bundle", "--path", "dist", "--summary", "Bundle.");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("'dist/' are not scanned");
  });

  test("doctor surfaces template standards and assumed activation items", () => {
    project = makeProject();
    project.write(".keystone/state.md", "- [x] Versioning\n- [x] Commit Convention (assumed: Conventional Commits)\n");
    const result = cli(project.root, "doctor");
    expect(result.stdout).toContain(".keystone/standards.md still contains template content");
    expect(result.stdout).toContain("review when possible: Commit Convention");
  });
});
