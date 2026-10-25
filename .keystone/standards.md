# Engineering Standards

<!-- keystone:template -->
<!-- Replace the examples below with this project's conventions, then delete the marker above. -->

## 1. Version Control

### Commit Messages

Default convention until activation records the project's own:

- **Format**: `<type>(<scope>): <short summary>`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
- **Scope**: the affected module, matching a stone id when one exists.
- Commits are atomic: one logical change each.

### Pull Requests

- A concise summary of the change and its motivation.
- A link to the issue or ticket.
- Impact analysis: affected stones (`keystone stone show <id>` lists the impact set).
- Test evidence.

## 2. Code Conventions

- **Naming**: e.g. camelCase for variables, PascalCase for types and classes.
- **Formatting**: e.g. the project's formatter and linter configuration.
- **Readability**: shallow nesting and explicit names over clever constructs.

## 3. Testing

- Unit tests for logic-dense functions.
- Integration tests for public endpoints and cross-module contracts.
- Coverage target: e.g. 80% on changed lines.

## 4. Documentation

- Public APIs are documented.
- Comments explain *why*, not *how*.
- Architectural decisions and module invariants live in stones.
