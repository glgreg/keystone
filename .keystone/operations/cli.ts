/**
 * Command-line dispatcher for Keystone operations.
 *
 * Canonical form:  keystone stone <command> [options]
 * The leading `stone` namespace is optional, so `keystone doctor` also works.
 */

import { parseArgs } from "node:util";
import type { ParseArgsConfig } from "node:util";
import { create } from "./commands/create.ts";
import { doctor } from "./commands/doctor.ts";
import { graph } from "./commands/graph.ts";
import { init } from "./commands/init.ts";
import { relate } from "./commands/relate.ts";
import { search } from "./commands/search.ts";
import { show } from "./commands/show.ts";
import type { Context, Io } from "./core/context.ts";
import { resolveRoot } from "./core/workspace.ts";
import { KeystoneError } from "./types.ts";

export const VERSION = "1.0.0";

type Options = NonNullable<ParseArgsConfig["options"]>;

const GLOBAL_OPTIONS: Options = {
  root: { type: "string" },
  help: { type: "boolean", short: "h" },
};

const COMMAND_OPTIONS: Record<string, Options> = {
  init: {},
  create: {
    path: { type: "string", short: "p" },
    type: { type: "string", short: "t" },
    tags: { type: "string" },
    summary: { type: "string", short: "s" },
    owner: { type: "string" },
    "depends-on": { type: "string" },
  },
  search: {
    tag: { type: "string" },
    type: { type: "string", short: "t" },
    limit: { type: "string", short: "n" },
    json: { type: "boolean" },
  },
  show: { json: { type: "boolean" } },
  relate: {
    type: { type: "string", short: "t" },
    remove: { type: "boolean" },
  },
  graph: {
    format: { type: "string", short: "f" },
    depth: { type: "string", short: "d" },
  },
  doctor: {
    fix: { type: "boolean" },
    strict: { type: "boolean" },
    json: { type: "boolean" },
    ignore: { type: "string" },
  },
};

export const HELP = `Keystone ${VERSION} - context architecture for AI software engineering

Usage:
  keystone init
  keystone stone <command> [options]

Commands:
  init                       Install or update the Key in this project (.keystone/)
  create <id> --path <dir>   Scaffold a co-located stone (.stone.<id>.md)
      [--type module|service|entity|policy|integration] [--tags a,b]
      [--summary <text>] [--owner <team>] [--depends-on a,b]
  search [query]             Find stones by id, tags, summary, headings and body
      [--tag <tag>] [--type <type>] [--limit <n>] [--json]
  show <id>                  Print a stone plus related stones and impact set [--json]
  relate <source> <target>   Link stones and keep the inverse relation in sync
      [--type depends_on|depended_by|children] [--remove]
  graph [id]                 Render the topology [--format ascii|mermaid|json] [--depth <n>]
  doctor                     Audit the Key and the stone graph [--fix] [--strict] [--json]
      [--ignore code1,code2]

Global options:
  --root <dir>               Project root (default: nearest directory holding .keystone/)
  -h, --help                 Show help
  --version                  Show version

Run 'keystone stone <command> --help' for details and examples.
Exit codes: 0 success, 1 failure (no search results, doctor errors, invalid input).`;

export const COMMAND_HELP: Record<string, string> = {
  init: `Usage: keystone init [--root <dir>]

Installs the Key in the project (the enclosing Git repository, or --root):
.keystone/ with the protocol, Key templates and the CLI, plus a pointer to
.keystone/protocol.md in the agent instruction files the project already has
(AGENTS.md, CLAUDE.md, GEMINI.md, .github/copilot-instructions.md), or in a
new AGENTS.md when there are none.

Safe to run again: project files (identity, architecture, standards, state,
stone template) are never overwritten, while the protocol and the CLI are
refreshed, so re-running init from a newer version upgrades them.

After a fresh install, follow section 6 (Activation) of .keystone/protocol.md.

Example:
  npx @glgreg/keystone init`,
  create: `Usage: keystone stone create <id> --path <dir> [options]

Writes <dir>/.stone.<id>.md: a generated frontmatter plus the body template
(.keystone/templates/stone.md) with Purpose, Invariants, Integration Contracts
and Anti-Patterns sections. Then regenerates the stone index in
.keystone/architecture.md. Afterwards, edit the body (and 'summary' if empty)
directly in the file; frontmatter edits by hand are fine too.

Options:
  -p, --path <dir>        Directory of the code this stone describes (required, must exist)
  -t, --type <type>       module (default) | service | entity | policy | integration
      --tags a,b          Search keywords
  -s, --summary <text>    One sentence shown in the index, search results and neighbor lists
      --owner <team>      Optional owner
      --depends-on a,b    Existing stones this one depends on (inverse 'depended_by' is written too)

Rules: <id> is lowercase kebab-case and unique; stones cannot live in hidden directories.

Example:
  keystone stone create password-reset --path src/auth/password-reset \\
    --tags auth,password,token --summary "Single-use reset tokens valid for 30 minutes." \\
    --depends-on users`,
  search: `Usage: keystone stone search [terms...] [options]

Ranked lexical search. Every term must match somewhere; matches weigh
id > tags > summary > path > headings > body. With no terms, lists all stones.

Options:
  --tag <tag>         Only stones with this exact tag
  -t, --type <type>   Only stones of this type
  -n, --limit <n>     Maximum results
  --json              Machine-readable output

Exit code 1 when nothing matches.

Example:
  keystone stone search refresh token`,
  show: `Usage: keystone stone show <id> [--json]

Prints the full stone file, then one line per related stone (relation, path,
summary), then the transitive impact set: every stone that directly or
indirectly depends on <id> and may be affected by changing it.

Example:
  keystone stone show auth`,
  relate: `Usage: keystone stone relate <source> <target> [--type <relation>] [--remove]

Adds (or with --remove, deletes) <target> in <source>'s relation list and keeps
the inverse in sync. Idempotent. Only the frontmatter is rewritten; bodies are
never touched.

Relations:
  depends_on (default)  <source> uses <target>; writes <target>.depended_by += <source>
  depended_by           <target> uses <source>; writes <target>.depends_on += <source>
  children              <target> is a sub-part of <source> in the navigation tree (no inverse stored)

Examples:
  keystone stone relate billing users                   # billing depends on users
  keystone stone relate auth password-reset --type children`,
  graph: `Usage: keystone stone graph [id] [--format ascii|mermaid|json] [--depth <n>]

Without <id>: the full navigation tree (children nested under parents, with
each stone's dependencies). With <id>: that stone's relations followed <n>
levels deep (default 1), plus its transitive impact set.

Example:
  keystone stone graph users --depth 2`,
  doctor: `Usage: keystone stone doctor [--fix] [--strict] [--json] [--ignore code1,code2]

Audits the Key (required files, unfilled templates, pending activation) and
every stone (parse errors, schema, id/filename match, broken, duplicate or
asymmetric relations, duplicate ids, co-located code, stale index).

Options:
  --fix          Repair mechanical issues only: duplicate relation entries, missing
                 inverse relations, stale index. Never edits stone bodies.
  --strict       Exit 1 on warnings as well as errors
  --json         Machine-readable report
  --ignore a,b   Hide diagnostics with these codes

Exit code 1 when errors are found. Run before reporting a task as done.`,
};

function parse(command: string, argv: string[]) {
  try {
    return parseArgs({
      args: argv,
      options: { ...GLOBAL_OPTIONS, ...(COMMAND_OPTIONS[command] ?? {}) },
      allowPositionals: true,
      strict: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new KeystoneError(`${message}\nRun 'keystone stone ${command} --help' for usage.`);
  }
}

export interface RunEnv {
  cwd: string;
  io: Io;
}

export function run(argv: string[], env: RunEnv): number {
  const args = argv[0] === "stone" ? argv.slice(1) : argv;
  const command = args[0];
  try {
    if (!command || command === "help" || command === "--help" || command === "-h") {
      const topic = command === "help" ? args[1] : undefined;
      env.io.stdout(topic && COMMAND_HELP[topic] ? COMMAND_HELP[topic] : HELP);
      return 0;
    }
    if (command === "--version" || command === "version") {
      env.io.stdout(VERSION);
      return 0;
    }
    if (!(command in COMMAND_OPTIONS)) {
      throw new KeystoneError(`unknown command '${command}'. Run 'keystone stone --help' for usage.`);
    }
    if (args.includes("--help") || args.includes("-h")) {
      env.io.stdout(COMMAND_HELP[command]);
      return 0;
    }
    const { values, positionals } = parse(command, args.slice(1));
    if (command === "init") return init(env.cwd, env.io, { root: values.root as string | undefined });
    const ctx: Context = {
      cwd: env.cwd,
      root: resolveRoot(values.root as string | undefined, env.cwd),
      io: env.io,
    };
    const v = values as Record<string, string | boolean | undefined>;
    switch (command) {
      case "create":
        return create(ctx, positionals[0], v as never);
      case "search":
        return search(ctx, positionals.join(" "), v as never);
      case "show":
        return show(ctx, positionals[0], v as never);
      case "relate":
        return relate(ctx, positionals[0], positionals[1], v as never);
      case "graph":
        return graph(ctx, positionals[0], v as never);
      case "doctor":
        return doctor(ctx, v as never);
    }
    return 1;
  } catch (error) {
    if (error instanceof KeystoneError) {
      env.io.stderr(`keystone: ${error.message}`);
      return error.exitCode;
    }
    throw error;
  }
}
