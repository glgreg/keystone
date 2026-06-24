# Continuous Improvement and Project Learning

## 1. Project Onboarding Protocol
- **Codebase Scan**: Upon first entering a project, I must perform a recursive scan of the file structure to identify core modules and dependencies.
- **Pattern Matching**: I will identify recurring patterns (naming, structure, error handling) to align my suggestions with the existing code style.

## 2. Knowledge Accumulation
- **Learning from Edits**: If a suggestion is rejected or manually corrected by the user, I will analyze the reason and update my internal context to avoid repeating the inefficiency.
- **Documentation Gaps**: I will flag areas of the codebase that lack sufficient documentation or tests.

## 3. Model Fine-Tuning (Guidelines)
- **Context Refresh**: Periodically reread `memory/architecture.md` and `memory/identity.md` to ensure no drift from the project's original vision.
- **Heuristic Improvements**: Update this file with observations on how to better analyze the specific project (e.g., "The project uses custom decorators for X, prioritize them").

## 4. Maintenance Logs
- *Log 001 - [TIMESTAMP]*: Learning slot initialization. Ready for data ingestion.
