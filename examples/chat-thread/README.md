# Chat Thread — Phase 1.5 Semantic Validation

Simulates multiple AI windows sharing one **chat thread** state via `OpenLessNode` only.

## Roles

| Node | Role |
|------|------|
| `windowA` | Appends user/assistant messages |
| `windowB` | Appends messages; lag simulation target |
| `observer` | Read-only: derived events + `getState()` |

## Run

```bash
npm run example:chat-thread          # short matrix (V1–V5)
npm run example:chat-thread-long     # long-running cognition simulation (LR1–LR6)
```

## Scenarios

| Script | Steps |
|--------|-------|
| `run.ts` | V1 boot · V2 observer · V3 concurrent append · V4 lag · V5 replay |
| `long-run.ts` | LR1 append session · LR2 stale loops · LR3 observers · LR4 lag loops · LR5 replay · LR6 concurrent loops |

Diagnostics: `validation-diagnostics.ts` (`CognitionLedger`), `simulation-harness.ts`.

Friction: `PHASE_1_5_USAGE_DIARY.md` · report: `PHASE_1_5_CHAT_THREAD_LONG_VALIDATION.md`.
