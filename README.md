<p align="center">
  <img src="./assets/keystone-banner.svg" alt="Keystone - Context is architecture." width="100%">
</p>

<p align="center">
  <strong>A context architecture for AI software engineering.</strong><br>
  Small notes next to your code that explain why it is the way it is, for the people and agents who work on it.
</p>

<p align="center">
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-f59e0b"></a>
  <img alt="version" src="https://img.shields.io/badge/version-2.0.0-0b1120">
  <img alt="runtime" src="https://img.shields.io/badge/runtime-Bun%20%7C%20Node%2022.18%2B-334155">
</p>

---

## What is Keystone?

Every codebase carries decisions you can't see in the code. The access token lasts 15 minutes because that is how long a stolen token stays useful. The webhook handler checks for duplicates because the payment provider retries. A new teammate picks these up over weeks, from reviews and hallway conversations.

A coding agent starts every session as that new teammate, with nobody to ask. It reads the code, sees *what* it does, and has to guess *why*. Sooner or later it guesses wrong, and the change looks perfectly reasonable in review.

Keystone gives those decisions a place to live. You describe each important part of your system in a short Markdown file, a **stone**, kept in the same folder as the code it describes. A folder at the project root, the **key**, holds the overview and an index of every stone. An agent asked to change billing can go from the key to the billing stone, learn what must stay true there and why, and only then open the code.

It is just files and conventions. Any agent that can read Markdown can use it: Claude Code, Codex, Cursor, Gemini CLI, Antigravity, or a person.

## The ideas behind it

**Reasons travel further than instructions.** "Tokens expire after 15 minutes because that bounds how long a leaked token is useful" lets the reader handle cases the author never thought of, like a feature request for "remember me". So stones are written as facts about the system, each with its reason, and that tends to keep agents consistent deep into long sessions.

**Context belongs next to the code.** A note in the same folder as the module shows up in the same pull request, moves when the module moves, and is easy to find when you need it. Stones are dotfiles (`.stone.auth.md`), so they stay out of the way in your editor while every tool can still see them.

**Read only what the task needs.** Each stone is small and links to the stones it depends on. An agent loads the one that governs its task plus short summaries of its neighbors, which keeps its attention on what matters and makes the blast radius of a change visible before anyone writes code.

**Let tools check what tools can check.** Links between stones, the index in the key, and the format of each file are all verified by `keystone stone doctor`. That leaves people and agents free to spend their attention on the content.

## How it fits together

```text
your-project/
├── .keystone/                  # The key
│   ├── soul.md                 # How agents should work in this project
│   ├── identity.md             # What the project is and who it is for
│   ├── architecture.md         # System overview and the index of stones
│   ├── standards.md            # Code, testing and Git conventions
│   ├── state.md                # Setup checklist
│   ├── templates/stone.md
│   ├── operations/             # The CLI (TypeScript, no dependencies)
│   └── bin/keystone            # Launcher that runs it with Bun or Node
└── src/
    ├── auth/
    │   ├── tokens.ts
    │   └── .stone.auth.md
    └── billing/
        ├── webhook.ts
        └── .stone.billing.md
```

When an agent picks up a task, it reads in three steps and stops once it has enough:

1. **Key**: `architecture.md`, to see the overall shape of the system and which stone covers the area.
2. **Stone**: the stone for that area, with its invariants and its neighbors.
3. **Code**: the source, now read with the intent in mind.

## Getting started

You need [Bun](https://bun.sh) 1.2+ or Node.js 22.18+ to run the CLI. The stones themselves are plain Markdown and work without it.

**1. Copy the key into your project**

```sh
git clone --depth 1 https://github.com/gugregorio/keystone.git /tmp/keystone
cp -r /tmp/keystone/.keystone ./
```

**2. Tell your agent about it**

Add one line to whatever instruction file your agent reads (`AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursorrules`...):

```markdown
This project uses Keystone for architectural context. Before planning or changing code, read `.keystone/soul.md` and follow it.
```

**3. Activate it**

Ask your agent:

```text
Activate the Keystone soul at .keystone/soul.md.
```

The agent looks around the repository and walks through a short setup. It drafts `identity.md` and `architecture.md` from what it finds, proposes your commit convention based on `git log`, and suggests a first set of stones for the main modules. It asks everything in a single message, waits for your answers, and finishes with **"Keystone ready."** You review each step once, and it remembers your answers in `state.md`.

**4. Take a look**

```sh
.keystone/bin/keystone stone graph
.keystone/bin/keystone stone doctor
```

## Writing a stone

A stone has a small header that tools read, and a body that people and agents read.

```markdown
---
id: auth
type: module
tags: [authentication, jwt, session]
relations:
  depends_on: [users]
  depended_by: []
  children: [token-rotation]
summary: Issues and verifies short-lived JWT access tokens for API requests.
---

# Auth

## Purpose and Design Decisions

Access tokens are stateless JWTs so any instance can verify them without a
database round trip. A stateless token can't be revoked early, so its
lifetime is the revocation window.

## Invariants

- Access tokens expire after 15 minutes. Longer sessions come from refresh
  token rotation (`token-rotation`), which keeps the revocation window short.

## Integration Contracts

- `issueAccessToken(userId)`, `verifyAccessToken(token)`.

## Anti-Patterns

- Raising the access token lifetime to keep users signed in.
```

The body is yours to shape. The template suggests four sections: why the module exists, what must stay true, what other parts rely on, and the tempting shortcuts that would break it. A good stone fits on one screen.

`keystone stone create` scaffolds a new stone and adds it to the index, and `keystone stone relate` links two stones in both directions. You rarely need to edit the header by hand.

<details>
<summary><strong>Header reference</strong></summary>

| Field       | Meaning                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------- |
| `id`        | Lowercase kebab-case, matching the filename `.stone.<id>.md`                                         |
| `type`      | `module`, `service`, `entity`, `policy` or `integration`                                             |
| `tags`      | Keywords that help search                                                                            |
| `relations` | `depends_on` / `depended_by` (kept in sync by the CLI) and `children` (for nesting)                  |
| `summary`   | One sentence, shown in the index, search results and neighbor listings                               |
| `owner`     | Optional team or person                                                                              |

The header uses a small, predictable subset of YAML: scalars, lists, the `relations` map and block text. If something falls outside it, the CLI reports the exact line so that every tool reads the file the same way.

</details>

## The CLI

```text
keystone stone create <id> --path <dir>   Create a stone next to the code
keystone stone search [query]             Find stones by id, tags, summary or content
keystone stone show <id>                  A stone, its neighbors, and what depends on it
keystone stone relate <source> <target>   Link two stones
keystone stone graph [id]                 Draw the graph (ascii, mermaid or json)
keystone stone doctor                     Check the key and every stone
```

Run it with `.keystone/bin/keystone`, which picks Bun if it's installed and Node otherwise. Every command has its own `--help` with options and examples, and exits with `1` when something needs attention, so it fits into scripts and CI.

<details>
<summary><strong>Example output</strong></summary>

```text
$ keystone stone graph
Key: inkwell-api (4 stones)
├── auth [module] src/auth
│   │   depends on: users
│   └── token-rotation [policy] src/auth/refresh
├── billing [integration] src/billing
│       depends on: users
└── users [entity] src/users

$ keystone stone graph users
users [entity] src/users
    User accounts and subscription plan persisted in PostgreSQL.
└── depended by
    ├── auth [module] src/auth
    └── billing [integration] src/billing

Transitive impact: auth, billing
```

</details>

`doctor` looks for broken or one-sided links, stones whose folder no longer has any code, an outdated index, and key files that still hold template text. `doctor --fix` repairs the mechanical issues (missing back-links, the index) and leaves the text you wrote as it is.

If you'd like a single executable for CI or a minimal container, compile one:

```sh
bun build --compile .keystone/operations/stone.ts --outfile keystone
```

## Upgrading from Agent Slot (v1)

Keystone 2 replaces the `soul.md` + `memory/` layout with the `.keystone/` folder. To migrate, move your filled-in `identity.md`, `architecture.md` and `standards.md` into `.keystone/`, remove the old folder, and activate again; the agent skips any step that is already done.

Some v1 files have new homes. Security requirements now sit in the stone of the module they protect, where they are read at the moment they matter. Guard-rail logs gave way to a single safety policy in the soul: before anything irreversible, the agent explains the impact and waits for your confirmation.

## Roadmap

- Distribution through `npx keystone` and prebuilt binaries
- An interactive graph explorer in the terminal
- Optional semantic search as a fallback for large graphs
- Starter templates per stone type

## Contributing

Issues and ideas are welcome. Before opening a pull request, run:

```sh
bun install
bun run typecheck
```

Commit messages follow the convention in [.keystone/standards.md](./.keystone/standards.md).

## License

Released under the [MIT License](./LICENSE).

---

<p align="center"><sub>A keystone is the wedge-shaped stone at the top of an arch. It goes in last and holds all the others in place.</sub></p>
