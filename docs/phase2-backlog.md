# Phase 2 Backlog

Planning document only. **Not a commitment to implement.**  
Items come from Phase 1.5 validation friction, classified as **ergonomics / semantic pressure**, not runtime correctness failures.

**Gate for any `core/*` change:** failing invariants or repeated structural failure (see [non-goals.md](./non-goals.md)).

---

## Priority legend

| Tag | Meaning |
|-----|---------|
| **P0** | Blocks credible Phase 2 theme (e.g. persistence needs stable write hook) |
| **P1** | High value ergonomics; no invariant change |
| **P2** | Nice-to-have; app layer can mitigate today |
| **Defer** | Explicitly not Phase 2 unless new evidence |

---

## Ergonomic backlog (from validation)

### API surface

| ID | Item | Tag | Notes |
|----|------|-----|-------|
| E-01 | `applyLocal` returns `{ ok, reason? }` | P1 | Today `boolean` + separate `error:transition` |
| E-02 | Typed read helper on `OpenLessNode` | P1 | e.g. `readData<T>()` — reduce `store` leakage |
| E-03 | Optional `applyPatch(topLevelKey, partial)` | P2 | Reduces whole-blob diffs; still shallow merge |
| E-04 | Default `timestamp` on diff if omitted | P2 | Minor DX |
| E-05 | Narrow public `index.ts` exports | P2 | Discourage Engine/Syncer bypass |
| E-06 | Documented lag simulation hook | P1 | Test-only `resetState` story; no production pretend API |

### Events and semantics

| ID | Item | Tag | Notes |
|----|------|-----|-------|
| E-10 | Distinguish `state:update` cause: local / inbound / full-sync | P1 | Addresses semantic collapse |
| E-11 | Optional `actor` / `sourcePeerId` on update payload | P1 | Observer attribution |
| E-12 | `sync:*` visibility guidance for observers | P2 | Doc + patterns; may not need core change |
| E-13 | Correlation id for apply → broadcast → receive | Defer | Needs protocol version |

### Schema

| ID | Item | Tag | Notes |
|----|------|-----|-------|
| E-20 | Zod (or similar) on `StateDiff` at Engine | P1 | `schemas/` placeholder today |
| E-21 | Optional app schema registry doc | P2 | Runtime stays `any` until E-20 |

### Idempotency

| ID | Item | Tag | Notes |
|----|------|-----|-------|
| E-30 | Op id in diff metadata (app convention first) | P2 | No core dedup yet |
| E-31 | Core dedup by op id | Defer | CRDT-like pressure; non-goal until proven necessary |

### Merge / conflicts

| ID | Item | Tag | Notes |
|----|------|-----|-------|
| E-40 | Conflict notification event | Defer | LWW is current contract |
| E-41 | CRDT layer | Defer | [non-goals.md](./non-goals.md) |

---

## Infrastructure themes (Phase 2 candidates)

Separate from ergonomics. **Plan before build.**

| Theme | Description | Depends on |
|-------|-------------|------------|
| **Persistence** | Snapshot + append log; replay on startup | Frozen write path ([runtime-model.md](./runtime-model.md)) |
| **Transport** | Real `SyncPeer` (e.g. WebSocket); cross-process | Invariant tests + dual-process harness |
| **Process runtime** | Daemon, config, graceful shutdown | Persistence + transport |
| **Schema hardening** | E-20 | Engine entry stable |

**Not in initial Phase 2 slice unless explicitly scheduled:** agents, workflow, UI, Kafka mesh, multi-region.

---

## Suggested Phase 2 sequencing (proposal)

```text
2a  Documentation consolidation     ← current (docs/)
2b  Schema + apply result ergonomics  (E-01, E-20) — optional core touch
2c  Persistence design + file backend
2d  Single transport adapter + e2e
2e  Daemon / ops minimal
```

Each step requires: updated tests, no invariant regression, diary entry if friction shifts.

---

## Explicitly not backlog (closed)

| Item | Reason |
|------|--------|
| Restore `broadcastDiff` / `receiveDiff` | Violates frozen invariants |
| New validation domain | Phase 1.5 complete |
| Fix LWW by silent core merge | Semantic change; needs non-goal review |
| Event sourcing as primary model | Non-goal |

---

## Tracking

| Source | Update when |
|--------|-------------|
| `PHASE_1_5_USAGE_DIARY.md` | New friction observed |
| `PHASE_1_5_VALIDATION_SUMMARY.md` | Stage conclusions change |
| This file | Phase 2 planning decisions |

**Do not** implement from this file without a scoped Phase 2 ticket and test plan.

---

## Success criteria for Phase 2 (when started)

| Criterion | Measure |
|-----------|---------|
| Invariants preserved | `npm test` 7/7+ |
| Examples still pass | `example:ai-workspace`, `example:shared-todo` |
| New capability has doc | Update `runtime-model` or `semantic-model` |
| No scope creep | Item maps to a row in this backlog or new approved row |
