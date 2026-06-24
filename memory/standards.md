# Engineering Standards

## 1. Version Control (Git)
### Commit Messages
- **Format**: `<type>(<scope>): <short summary>`
- **Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.
- **Scope**: Affected codebase section.

### Pull Requests
- Must include a concise summary of changes.
- Must link to the relevant issue/ticket.
- Must include a checklist of tests performed.

## 2. Code Conventions
- **Naming**: [e.g., camelCase for variables, PascalCase for classes]
- **Formatting**: [e.g., Prettier/ESLint rules]
- **Clean Code**: Avoid deep nesting, prioritize readability over "clever" code.

## 3. Testing Requirements
- **Unit Tests**: Mandatory for functions with dense logic.
- **Integration Tests**: Required for API endpoints.
- **Minimum Coverage**: [e.g., 80%]

## 4. Documentation
- All public APIs must be documented.
- Complex logic must have explanatory comments about the "why", not the "how".
