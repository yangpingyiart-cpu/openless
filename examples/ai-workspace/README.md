# Replicated AI Workspace State (Phase 1.5)

Usage validation for **multi-agent / multi-window** shared workspace — not a product.

## Rules

- Writes: `OpenLessNode.applyLocal` only (via `PlannerClient` / `CoderClient`)
- Reads: `node.store.getState()`
- Sync wiring: `InMemorySyncHub` from public API
- App events: derived in `workspace-events.ts` from `state:update`

## Roles

| Node | Role |
|------|------|
| `planner` | `workspace`, `context`, `task` |
| `coder` | `files`, `artifacts`, `tools`, `presence` |
| `ui` | Observer only — no `applyLocal` |

## Run

```bash
npm run example:ai-workspace
```

Findings: [`PHASE_1_5_AI_WORKSPACE_VALIDATION.md`](../../PHASE_1_5_AI_WORKSPACE_VALIDATION.md)

## Scenarios in `run.ts`

- **V1** — mesh boot + seed
- **V2** — planner handoff + coder artifacts
- **V3** — UI observer (events + getState)
- **V4** — lag + full-sync; **V4b** — `recovering` rules
- **V5** — concurrent context overwrite
- **V6** — duplicate `applyLocal` payload
