# Non-Goals

> **Authority:** normative exclusions live in [NON_GOALS.md](../NON_GOALS.md) (repo root). This file is supporting planning context only.

Explicit exclusions for OpenLess. Items here are **out of scope** unless a future phase proposal revisits them with evidence.

Phase 1.5 concluded: **none of these are required for basic collaborative replicated state to work.**

---

## Runtime redesign triggers (not met)

Do **not** reopen core architecture unless **all** apply:

1. Friction repeats across ≥2 domains and cannot be mitigated in app layer  
2. Structural failure: convergence break, invariant test failure, or impossible `OpenLessNode`-only integration  
3. Fix requires `core/*` semantic change, not ergonomics  

Current tally: **0**.

---

## Consistency and merge

| Non-goal | Rationale |
|----------|-----------|
| **CRDT / OT / automatic merge** | Validated LWW on shallow keys is sufficient for prototype; merge is app or future layer |
| **Field-level patch operator in core** | Apps send top-level blobs; patch DSL is ergonomics backlog |
| **Conflict events** | No `merge:conflict` runtime event in Phase 1 |
| **Vector clocks / logical timestamps** | Integer `version` + full-sync only |

---

## Infrastructure

| Non-goal | Rationale |
|----------|-----------|
| **Production transport in Phase 1** | Redis, Kafka, WebSocket adapters not in repo |
| **WAL / persistence in Phase 1** | Memory-only Store; Phase 2 may plan, not ship by default |
| **Cross-process daemon** | No `openless-node` binary |
| **Multi-region / geo replication** | No membership or partition tolerance model |
| **Horizontal auto-scaling** | No cluster coordinator |

---

## Orchestration and product

| Non-goal | Rationale |
|----------|-----------|
| **Agent framework** | `agents/` empty; apps call `applyLocal` |
| **Workflow engine** | No task DAG, scheduling, or saga |
| **UI product / IDE** | Examples are console scripts |
| **Auth / multi-tenant / ACL** | No identity model on diffs |
| **Rate limiting / quotas** | Not in runtime |

---

## Event and API models

| Non-goal | Rationale |
|----------|-----------|
| **Event sourcing as source of truth** | Store is snapshot; no immutable log API |
| **New core events for app domains** | `todo:*`, `workspace:*` stay application-layer |
| **Built-in actor / causation on all events** | Diary friction; Phase 2 ergonomics only |
| **Global dedup / idempotency keys** | Version ≠ op id; retries are app concern |
| **Read-only replica mode flag** | Convention: observer does not call `applyLocal` |

---

## Validation and process

| Non-goal | Rationale |
|----------|-----------|
| **More validation domains in Phase 1.5** | Stopped after ai-workspace + shared-todo |
| **Fixing recorded friction in place** | Classified as Phase 2 ergonomics backlog |
| **Marketing / vision docs in `docs/`** | This folder is architecture only |

---

## Deleted paths (do not restore)

These existed pre–Phase 1 and must **not** return:

| Removed API / pattern | Why |
|-----------------------|-----|
| `DeltaSyncer.broadcastDiff` | Bypassed Engine |
| `DeltaSyncer.receiveDiff` | Bypassed Engine |
| `DeltaSyncer.handleInboundMessage` as mutation owner | Replaced by `OpenLessNode.handleInbound` |
| Demo `wireEngineInboundSync` | Monkey-patch masked dual path |
| Transport calling `TransitionEngine` directly | Breaks single pipeline |

---

## What remains in scope (reference)

| In scope | Doc |
|----------|-----|
| Frozen runtime model | [runtime-model.md](./runtime-model.md) |
| Observable semantics | [semantic-model.md](./semantic-model.md) |
| Phase 2 planning items | [phase2-backlog.md](./phase2-backlog.md) |

---

## Review cadence

Revisit non-goals when:

- `PHASE_1_5_USAGE_DIARY.md` records structural failure  
- `npm test` invariant suite fails on main/frozen branch  
- Explicit Phase 2 proposal approved (not ad-hoc code changes)
