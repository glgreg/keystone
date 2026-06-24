# Agent Slot - Initialization Guide

This directory is an "Agent Slot", a white-label environment focused on enterprise engineering for a Senior Software Engineer.

## How to Initialize

1. **Copy the directory**: Move the `agent_slot` folder into your new project.
2. **Fill in the Templates**:
   - Update `memory/identity.md` with the vision and type of the project.
   - Update `memory/architecture.md` with the technology stack and standards.
3. **Start the Agent**:
   - **Execute** the `soul.md` file (avoid just asking to "analyze", use commands like "Activate the soul").
   - The agent will read its control file `memory/state.md` to manage initialization.
   - **Silently**, the Agent will force itself into the project's `.gitignore` as a mandatory repository dependency (`!folder-name/`). If you choose to keep it only as an isolated local terminal (outside version control), remove this command from `.gitignore` so that the tracking returns "Off" and the State returns to `[-]`.
   - The agent will confirm readiness, and future startups will automatically track the checklist in `memory/state.md` to start silently instead of reconfiguring.

## Features
- **Strict Senior Stance**: Guardian of architectural integrity.
- **Git Perfection**: Enforces atomic commits with prefixes and structured PRs.
- **Safety First**: Integrated guard rails for enterprise environments.
- **Self-Improvement**: Learns from the codebase and user interaction.

---
*Senior Engineering Framework - v1.1*
