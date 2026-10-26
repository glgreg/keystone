import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { cli, makeProject, seedGraph, stoneSource } from "./helpers.ts";
import type { Project } from "./helpers.ts";
import { parseFrontmatter, splitDocument } from "../.keystone/operations/core/frontmatter.ts";
import { toMeta } from "../.keystone/operations/core/stone.ts";
import { VERSION } from "../.keystone/operations/cli.ts";

function meta(p: Project, rel: string) {
  return toMeta(parseFrontmatter(splitDocument(p.read(rel)).frontmatter));
}

let project: Project;
afterEach(() => project?.cleanup());

function fresh(seed = true): Project {
  project = makeProject();
  if (seed) seedGraph(project);
  return project;
}

describe("general CLI behavior", () => {
  test("help, version and optional 'stone' namespace", () => {
    const p = fresh(false);
    expect(cli(p.root, "--help").stdout).toContain("Usage:");
    expect(cli(p.root, "stone", "--version").stdout).toBe(VERSION);
    expect(cli(p.root, "doctor").code).toBe(0);
    expect(cli(p.root, "stone", "doctor").code).toBe(0);
  });

  test("unknown commands and options fail with exit code 1", () => {
    const p = fresh(false);
    const unknown = cli(p.root, "stone", "explode");
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain("unknown command");
    const badFlag = cli(p.root, "stone", "search", "--nope");
    expect(badFlag.code).toBe(1);
    expect(badFlag.stderr).toContain("--nope");
  });

  test("root is discovered by walking up from a subdirectory", () => {
    const p = fresh();
    const result = cli(join(p.root, "src/auth/rotation"), "stone", "search", "billing");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("src/billing/.stone.billing.md");
  });

  test("hidden and dependency directories are not scanned", () => {
    const p = fresh();
    p.write("node_modules/pkg/.stone.ghost.md", stoneSource({ id: "ghost" }));
    p.write(".cache/.stone.hidden.md", stoneSource({ id: "hidden" }));
    const result = cli(p.root, "stone", "search", "--json");
    const ids = JSON.parse(result.stdout).map((hit: { id: string }) => hit.id);
    expect(ids).not.toContain("ghost");
    expect(ids).not.toContain("hidden");
    expect(ids).toHaveLength(5);
  });
});

describe("create", () => {
  test("scaffolds a stone, registers it in the index and passes doctor after filling", () => {
    const p = fresh(false);
    p.write("src/payments/index.ts", "export {};\n");
    const result = cli(p.root, "stone", "create", "payments", "--path", "src/payments", "--tags", "stripe,webhook", "--summary", "Payment processing.");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Created src/payments/.stone.payments.md");
    const content = p.read("src/payments/.stone.payments.md");
    expect(content).toContain("id: payments");
    expect(meta(p, "src/payments/.stone.payments.md").tags).toEqual(["stripe", "webhook"]);
    expect(content).toContain("# Payments");
    expect(content).toContain("## Invariants");
    expect(p.read(".keystone/architecture.md")).toContain("| `payments` | module | [src/payments](../src/payments/.stone.payments.md) | Payment processing. |");
    const doctor = cli(p.root, "stone", "doctor", "--json");
    const codes = JSON.parse(doctor.stdout).diagnostics.map((d: { code: string }) => d.code);
    expect(codes).not.toContain("stale-index");
    expect(codes).not.toContain("missing-summary");
  });

  test("links --depends-on and writes the inverse relation", () => {
    const p = fresh();
    p.write("src/orders/index.ts", "export {};\n");
    const result = cli(p.root, "stone", "create", "orders", "-p", "src/orders", "--depends-on", "users,billing", "-s", "Orders.");
    expect(result.code).toBe(0);
    expect(meta(p, "src/users/.stone.users.md").relations.depended_by).toEqual(["auth", "billing", "orders"]);
    expect(meta(p, "src/billing/.stone.billing.md").relations.depended_by).toEqual(["orders"]);
    expect(meta(p, "src/orders/.stone.orders.md").relations.depends_on).toEqual(["users", "billing"]);
  });

  test("validates id, type, path and collisions", () => {
    const p = fresh();
    mkdirSync(join(p.root, "src/x"), { recursive: true });
    expect(cli(p.root, "stone", "create", "Bad_Id", "--path", "src/x").stderr).toContain("invalid stone id");
    expect(cli(p.root, "stone", "create", "x", "--path", "src/x", "--type", "widget").stderr).toContain("invalid type");
    expect(cli(p.root, "stone", "create", "x").stderr).toContain("missing --path");
    expect(cli(p.root, "stone", "create", "x", "--path", "src/missing").stderr).toContain("does not exist");
    expect(cli(p.root, "stone", "create", "x", "--path", "..").stderr).toContain("outside the project root");
    expect(cli(p.root, "stone", "create", "auth", "--path", "src/x").stderr).toContain("already exists");
    expect(cli(p.root, "stone", "create", "x", "--path", "src/x", "--depends-on", "nope").stderr).toContain("unknown stone 'nope'");
    expect(cli(p.root, "stone", "create", "x", "--path", ".keystone").stderr).toContain("hidden directories");
    expect(existsSync(join(p.root, "src/x/.stone.x.md"))).toBe(false);
  });
});

describe("search", () => {
  test("ranks identifier matches first", () => {
    const p = fresh();
    const hits = JSON.parse(cli(p.root, "stone", "search", "auth", "--json").stdout);
    expect(hits[0].id).toBe("auth");
  });

  test("matches tags, summaries and body text", () => {
    const p = fresh();
    expect(JSON.parse(cli(p.root, "stone", "search", "oauth", "--json").stdout)[0].id).toBe("auth");
    expect(JSON.parse(cli(p.root, "stone", "search", "idempotent", "--json").stdout)[0].id).toBe("billing");
    expect(JSON.parse(cli(p.root, "stone", "search", "15 minutes", "--json").stdout)[0].id).toBe("auth");
  });

  test("uses AND semantics across tokens and supports filters", () => {
    const p = fresh();
    const both = JSON.parse(cli(p.root, "stone", "search", "jwt", "refresh", "--json").stdout);
    expect(both.map((h: { id: string }) => h.id)).toEqual(["token-rotation"]);
    const byTag = JSON.parse(cli(p.root, "stone", "search", "--tag", "jwt", "--json").stdout);
    expect(byTag.map((h: { id: string }) => h.id).sort()).toEqual(["auth", "token-rotation"]);
    const byType = JSON.parse(cli(p.root, "stone", "search", "--type", "entity", "--json").stdout);
    expect(byType.map((h: { id: string }) => h.id)).toEqual(["users"]);
    expect(JSON.parse(cli(p.root, "stone", "search", "-n", "2", "--json").stdout)).toHaveLength(2);
  });

  test("returns exit code 1 when nothing matches", () => {
    const p = fresh();
    const result = cli(p.root, "stone", "search", "kubernetes");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("No stones match");
  });
});

describe("relate", () => {
  test("adds depends_on with its inverse and is idempotent", () => {
    const p = fresh();
    expect(cli(p.root, "stone", "relate", "billing", "cache").code).toBe(0);
    expect(meta(p, "src/billing/.stone.billing.md").relations.depends_on).toEqual(["users", "cache"]);
    expect(meta(p, "src/cache/.stone.cache.md").relations.depended_by).toEqual(["auth", "billing"]);
    expect(cli(p.root, "stone", "relate", "billing", "cache").stdout).toContain("No change");
  });

  test("removes relations on both sides", () => {
    const p = fresh();
    expect(cli(p.root, "stone", "relate", "auth", "cache", "--remove").code).toBe(0);
    expect(meta(p, "src/auth/.stone.auth.md").relations.depends_on).toEqual(["users"]);
    expect(meta(p, "src/cache/.stone.cache.md").relations.depended_by).toEqual([]);
  });

  test("children have no stored inverse", () => {
    const p = fresh();
    cli(p.root, "stone", "relate", "billing", "users", "--type", "children");
    expect(meta(p, "src/billing/.stone.billing.md").relations.children).toEqual(["users"]);
    expect(meta(p, "src/users/.stone.users.md").relations.children).toEqual([]);
  });

  test("preserves the body when rewriting frontmatter", () => {
    const p = fresh();
    cli(p.root, "stone", "relate", "auth", "billing");
    expect(p.read("src/auth/.stone.auth.md").endsWith("---\n\n# Auth\n\n## Invariants\n\n- Access tokens expire after 15 minutes.\n")).toBe(true);
  });

  test("rejects invalid input", () => {
    const p = fresh();
    expect(cli(p.root, "stone", "relate", "auth").stderr).toContain("usage");
    expect(cli(p.root, "stone", "relate", "auth", "auth").stderr).toContain("itself");
    expect(cli(p.root, "stone", "relate", "auth", "nope").stderr).toContain("unknown stone 'nope'");
    expect(cli(p.root, "stone", "relate", "auth", "users", "--type", "likes").stderr).toContain("invalid relation type");
  });

  test("refuses to rewrite stones whose frontmatter would lose data", () => {
    const p = fresh();
    p.write("src/cache/.stone.cache.md", stoneSource({ id: "cache", type: "service" }).replace("  children: []", "  children: []\n  blocks: [auth]"));
    const result = cli(p.root, "stone", "relate", "billing", "cache");
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("unknown relation kind 'blocks'");
    expect(p.read("src/cache/.stone.cache.md")).toContain("blocks: [auth]");
  });
});

describe("graph and show", () => {
  test("focused ASCII view shows relations and transitive impact", () => {
    const p = fresh();
    const result = cli(p.root, "stone", "graph", "users");
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("users [entity] src/users");
    expect(result.stdout).toContain("depended by");
    expect(result.stdout).toContain("billing [module] src/billing");
    expect(result.stdout).toContain("Transitive impact: auth, billing");
  });

  test("transitive impact follows dependency chains", () => {
    const p = fresh();
    cli(p.root, "stone", "relate", "billing", "auth");
    expect(cli(p.root, "stone", "graph", "cache").stdout).toContain("Transitive impact: auth, billing");
  });

  test("depth expands chains and marks cycles", () => {
    const p = fresh();
    cli(p.root, "stone", "relate", "users", "auth");
    const result = cli(p.root, "stone", "graph", "auth", "--depth", "3");
    expect(result.stdout).toContain("(cycle)");
  });

  test("full view nests children under their parent", () => {
    const p = fresh();
    const lines = cli(p.root, "stone", "graph").stdout.split("\n");
    expect(lines[0]).toContain("(5 stones)");
    const authIndex = lines.findIndex((line) => line.includes("auth [module]"));
    const childLine = lines.find((line) => line.includes("token-rotation [policy]")) ?? "";
    expect(authIndex).toBeGreaterThan(0);
    expect(childLine.indexOf("token-rotation")).toBeGreaterThan(lines[authIndex].indexOf("auth"));
    expect(lines.some((line) => line.includes("depends on: users, cache"))).toBe(true);
  });

  test("mermaid and json formats", () => {
    const p = fresh();
    const mermaid = cli(p.root, "stone", "graph", "--format", "mermaid").stdout;
    expect(mermaid.startsWith("flowchart TD")).toBe(true);
    expect(mermaid).toContain('s_auth["auth (module)"]');
    expect(mermaid).toContain('s_token_rotation["token-rotation (policy)"]');
    expect(mermaid).toContain("s_auth -->|depends on| s_users");
    expect(mermaid).toContain("s_auth -.->|child| s_token_rotation");
    expect(mermaid.match(/s_billing -->\|depends on\| s_users/g)).toHaveLength(1);
    const json = JSON.parse(cli(p.root, "stone", "graph", "auth", "-f", "json").stdout);
    expect(json.nodes.map((n: { id: string }) => n.id).sort()).toEqual(["auth", "cache", "token-rotation", "users"]);
  });

  test("show prints the stone, related summaries and impact", () => {
    const p = fresh();
    const result = cli(p.root, "stone", "show", "auth");
    expect(result.stdout).toContain("# src/auth/.stone.auth.md");
    expect(result.stdout).toContain("Access tokens expire after 15 minutes.");
    expect(result.stdout).toContain("- depends on: users (src/users/.stone.users.md) - User accounts and profile persistence.");
    expect(result.stdout).toContain("- children: token-rotation");
    const json = JSON.parse(cli(p.root, "stone", "show", "users", "--json").stdout);
    expect(json.impact).toEqual(["auth", "billing"]);
    expect(cli(p.root, "stone", "show", "nope").code).toBe(1);
  });
});

describe("doctor", () => {
  function codes(p: Project, ...extra: string[]): string[] {
    return JSON.parse(cli(p.root, "stone", "doctor", "--json", ...extra).stdout).diagnostics.map((d: { code: string }) => d.code);
  }

  test("a consistent graph has no errors (index may be stale until --fix)", () => {
    const p = fresh();
    expect(codes(p)).toContain("stale-index");
    const fixed = cli(p.root, "stone", "doctor", "--fix");
    expect(fixed.code).toBe(0);
    expect(fixed.stdout).toContain("regenerated stone index");
    expect(codes(p)).not.toContain("stale-index");
    expect(codes(p).filter((c) => !["core-context-template", "state-pending"].includes(c))).toEqual([]);
  });

  test("reports broken relations as errors", () => {
    const p = fresh();
    cli(p.root, "stone", "relate", "auth", "billing");
    p.write("src/billing/.stone.billing.md", stoneSource({ id: "billing", dependsOn: ["ledger"] }));
    const result = cli(p.root, "stone", "doctor");
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("broken-relation");
    expect(result.stdout).toContain("unknown stone 'ledger'");
  });

  test("detects and fixes asymmetric and duplicate relations", () => {
    const p = fresh();
    p.write("src/cache/.stone.cache.md", stoneSource({ id: "cache", type: "service", tags: ["redis"], dependedBy: [] }));
    p.write("src/billing/.stone.billing.md", stoneSource({ id: "billing", dependsOn: ["users", "users"] }));
    expect(codes(p)).toEqual(expect.arrayContaining(["asymmetric-relation", "duplicate-relation"]));
    cli(p.root, "stone", "doctor", "--fix");
    expect(codes(p)).not.toContain("asymmetric-relation");
    expect(codes(p)).not.toContain("duplicate-relation");
    expect(meta(p, "src/cache/.stone.cache.md").relations.depended_by).toEqual(["auth"]);
    expect(meta(p, "src/billing/.stone.billing.md").relations.depends_on).toEqual(["users"]);
  });

  test("reports schema problems", () => {
    const p = fresh(false);
    p.write("src/a/index.ts", "");
    p.write("src/a/.stone.a.md", stoneSource({ id: "b", type: "gizmo", tags: [], summary: '""' }));
    p.write("src/c/index.ts", "");
    p.write("src/c/.stone.c.md", "---\nid: c\n  type: bad\n---\n");
    p.write("src/d/index.ts", "");
    p.write("src/d/.stone.Bad.md", stoneSource({ id: "Bad" }));
    const found = codes(p);
    expect(found).toEqual(expect.arrayContaining(["id-mismatch", "unknown-type", "missing-summary", "missing-tags", "parse-error", "invalid-filename"]));
    expect(cli(p.root, "stone", "doctor").code).toBe(1);
  });

  test("reports duplicate ids, missing co-located source and missing invariants", () => {
    const p = fresh();
    p.write("lib/other/.stone.users.md", stoneSource({ id: "users", body: "\n# Users again\n" }));
    const found = codes(p);
    expect(found).toContain("duplicate-id");
    expect(found).toContain("no-co-located-source");
    expect(found).toContain("missing-invariants");
  });

  test("checks the Key itself", () => {
    project = makeProject({ key: false });
    expect(codes(project)).toContain("key-missing");
    const p2 = makeProject();
    try {
      p2.write(".keystone/identity.md", "# Identity\n\nFilled.\n");
      const found = JSON.parse(cli(p2.root, "stone", "doctor", "--json").stdout).diagnostics;
      const templates = found.filter((d: { code: string }) => d.code === "core-context-template");
      expect(templates).toHaveLength(2);
      expect(found.find((d: { code: string }) => d.code === "state-pending").message).toContain("Versioning, Core Context, Commit Convention, Stone Map");
    } finally {
      p2.cleanup();
    }
  });

  test("--strict fails on warnings and --ignore filters codes", () => {
    const p = fresh();
    expect(cli(p.root, "stone", "doctor").code).toBe(0);
    expect(cli(p.root, "stone", "doctor", "--strict").code).toBe(1);
    expect(cli(p.root, "stone", "doctor", "--strict", "--ignore", "stale-index,core-context-template").code).toBe(0);
  });
});

describe("diff stability and help", () => {
  test("rewrites keep hand-written inline lists inline (no formatting churn)", () => {
    const p = fresh();
    const before = p.read("src/auth/.stone.auth.md");
    cli(p.root, "stone", "relate", "auth", "billing");
    const after = p.read("src/auth/.stone.auth.md");
    const changed = after.split("\n").filter((line, i) => line !== before.split("\n")[i]);
    expect(changed).toEqual(["  depends_on: [users, cache, billing]"]);
  });

  test("long or complex lists fall back to block style and still round-trip", () => {
    const p = fresh();
    const tags = Array.from({ length: 12 }, (_, i) => `tag-number-${i}`);
    p.write("src/users/.stone.users.md", stoneSource({ id: "users", type: "entity", tags, dependedBy: ["auth", "billing"] }));
    cli(p.root, "stone", "relate", "users", "cache");
    const content = p.read("src/users/.stone.users.md");
    expect(content).toContain("tags:\n  - tag-number-0");
    expect(meta(p, "src/users/.stone.users.md").tags).toEqual(tags);
  });

  test("per-command help explains semantics", () => {
    const p = fresh(false);
    const relateHelp = cli(p.root, "stone", "relate", "--help");
    expect(relateHelp.code).toBe(0);
    expect(relateHelp.stdout).toContain("children              <target> is a sub-part of <source>");
    expect(cli(p.root, "stone", "help", "create").stdout).toContain("Writes <dir>/.stone.<id>.md");
    expect(cli(p.root, "stone", "doctor", "-h").stdout).toContain("Never edits stone bodies");
    expect(cli(p.root, "stone", "create", "--bogus").stderr).toContain("keystone stone create --help");
  });
});
