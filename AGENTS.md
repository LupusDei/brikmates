# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd onboard` to get started.


## Workflow

**See `.beads/PRIME.md` for the complete mandatory workflow.**

The workflow is automatically loaded at session start. Key points:
- Every change needs a bead
- Always use feature branches (never master)
- Run `bd sync` immediately after claiming a task
- Tests are mandatory
- Quality gates must pass before committing

---


## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --status in_progress  # Claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```


## Project-Specific: Code Quality

### Modularity
- **Design for parallel work**: Each module should be independently testable
- **Minimize cross-module dependencies**: Use clear interfaces between modules
- **One responsibility per file**: Keep files focused and small
- **Avoid tight coupling**: Changes in one module shouldn't break others

### Clean Code Standards
- **TypeScript strict mode**: No `any` types, proper type definitions
- **Consistent naming**: Use clear, descriptive names
- **DRY principle**: Don't repeat yourself - extract common logic
- **Comments**: Only when necessary - code should be self-documenting
- **Error handling**: Handle edge cases gracefully


## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds

