# CLAUDE.md

All project rules for AI agents live in AGENTS.md so Claude, Codex and other tools share one source of truth.

@AGENTS.md

## Claude-specific notes

- Use plan mode for any task in docs/TASKS.md that is not a small fix, and show the plan before editing.
- When a task touches `apps/api/src/ledger`, `apps/api/src/bids`, the Redis Lua scripts or `packages/shared/src/fees.ts`, finish by asking a fresh subagent to review the diff for money and concurrency bugs only, then address what it finds.
- Keep this file short; put new rules in AGENTS.md.
