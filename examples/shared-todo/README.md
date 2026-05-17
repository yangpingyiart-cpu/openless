# Shared Todo — Phase 1.5 Usage Validation

Minimal multi-user todo collaboration using **only** `OpenLessNode`.

## Roles

| Node | Writes | Reads |
|------|--------|-------|
| `userA` | `TodoClient` | `store.getState()` |
| `userB` | `TodoClient` | `store.getState()` |
| `observer` | **none** | events + `getState()` |

## Run

```bash
npm run example:shared-todo
```

## Scenarios (`run.ts`)

| Step | Coverage |
|------|----------|
| V1 | Mesh boot, seed users, create todos |
| V2 | Different todos: edit, complete, assign |
| V3 | Observer app events + runtime events |
| V4 | Concurrent edit same todo (overwrite) |
| V5 | Lag + full-sync recovery |
| V6 | Duplicate `applyLocal` payload |

## Files

- `todo-model.ts` — `TodoState` (top-level: `todos`, `users`, `presence`, `metadata`)
- `todo-client.ts` — `applyLocal` wrappers
- `todo-events.ts` — derived from `state:update` only
- `run.ts` — validation script

Findings: `PHASE_1_5_USAGE_DIARY.md` § Shared Todo Validation.
