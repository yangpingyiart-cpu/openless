# Semantic Model

Formal semantics of **observable behavior** after Phase 1.5 validation.  
This document defines what applications can rely on; it does not promise future ergonomics.

---

## State semantics

### Version

| Rule | Detail |
|------|--------|
| Monotonic | `version` increases by 1 on each successful `applyDiff` |
| Authority | Store assigns version; diff must not set it |
| OCC | Replicas accept inbound diff only when `incoming.version === local + 1` |

### `data` merge

`applyDiff` shallow-merges `mutation.data` into `state.data`:

- Top-level keys in `mutation.data` overwrite or add keys
- No deep merge inside nested objects
- Apps that need nested updates must send **whole sub-objects** (e.g. entire `todos` map)

**Consequence:** concurrent writers on the same top-level key → **last write wins (LWW)**. Convergence still holds (all replicas agree on the winner); conflict is not surfaced as an event.

### `status`

| Value | Meaning (runtime) |
|-------|-------------------|
| `active` | Normal transitions allowed (subject to rules) |
| `recovering` | Restricted to recovery mutations (default rule) |
| `error` | Valid state value; no special auto-behavior in Phase 1 |

---

## Convergence guarantees

**Guaranteed (validated):**

| Guarantee | Mechanism |
|-----------|-----------|
| **Eventually identical state** on all replicas | After sequential diffs and/or successful full-sync, same `version` + `data` + `status` |
| **No silent Engine bypass** | All applied mutations went through `applyTransition` or `applyFullSync` |
| **Gap does not apply wrong diff** | Non-sequenced diff rejected; full-sync replaces state |

**Not guaranteed:**

| Non-guarantee | Detail |
|---------------|--------|
| **Merge of concurrent intent** | LWW only |
| **Causal ordering across peers** | Only version order on each replica |
| **Idempotent logical ops** | Replaying same payload can advance version again |
| **Preservation of lagging node drafts** | Full-sync overwrites local state |

---

## Recovery semantics

### Version gap

```text
local.version = n
incoming.version = n + 2   (or any value ≠ n + 1)

→ diff not applied
→ diff:received { applied: false }
→ sync:request
→ peer sends full-sync
→ applyFullSync(peer snapshot)
→ sync:complete (on receiving replica)
```

### Full-sync

| Aspect | Semantics |
|--------|-----------|
| Pipeline | `TransitionEngine.applyFullSync` → `resetState` |
| Rules | Structural validation only; no recovery business rules |
| Events | `state:update` + `sync:complete` |
| Effect | Entire `GlobalState` replaced with peer snapshot |

### `recovering` mode

| Aspect | Semantics |
|--------|-----------|
| Enter | `mutation.status = "recovering"` via `applyTransition` |
| Writes | Only `recovery` / `recovery.*` data keys (+ allowed status) |
| Exit | `status → active` (or `error`) via valid diff |
| Illegal write | `applyLocal` → `false`, `error:transition` |

**Note:** Lag simulation in examples uses `store.resetState` — **not** a public recovery API. See [phase2-backlog.md](./phase2-backlog.md).

---

## Observer semantics

An **observer** replica:

- Never calls `applyLocal`
- Subscribes to runtime events on **its** `node.bus`
- Reads via `node.store.getState()`

**Guaranteed:**

- After convergence, observer snapshot matches writer replicas
- `state:update` fires for every applied change visible on that replica

**Not guaranteed:**

| Gap | Detail |
|-----|--------|
| Writer attribution | Events do not include “who wrote” on other nodes |
| `sync:complete` on observer | Often only on the lagged peer that performed full-sync |
| `error:transition` on observer | Errors fire on the writer’s bus, not observer’s |
| Derived app events | `nodeId` in app bridge is **observer’s id**, not source peer |

**Recommended pattern:** derive app events from `state:update` by diffing `previousState` vs `state`; treat `payload.diff` as ground truth for what changed.

---

## Replay semantics

Phase 1 has **no append-only replay log**. “Replay” in validation means:

| Term | Meaning in OpenLess today |
|------|---------------------------|
| **Inbound replay** | Same `SyncMessage` delivered again |
| **Duplicate `applyLocal`** | Same `StateDiff` submitted twice locally |

**Observed behavior:**

| Case | Result |
|------|--------|
| Duplicate inbound diff (same version) when local already at that version | Not sequenced → gap path or no-op on apply |
| Duplicate `applyLocal` with identical diff | Often **second apply succeeds** and `version` increments again |
| Full-sync after lag | State equals peer; history not reconstructed diff-by-diff |

**Not provided:** op ids, dedup cache, event sourcing, WAL replay on startup.

---

## Event semantics (runtime)

| Event | When | Payload use |
|-------|------|-------------|
| `state:update` | Successful `applyTransition` or `applyFullSync` | `state`, `previousState`, `diff` |
| `error:transition` | Validation or rule failure | `reason`, optional `rule` |
| `diff:broadcast` | After `publishDiff` | Outbound fan-out metadata |
| `diff:received` | After inbound diff handling | `applied: boolean` |
| `sync:request` | Version mismatch | `localVersion`, `incomingVersion` |
| `sync:complete` | After successful `applyFullSync` | Peer snapshot applied |

### Semantic collapse (known)

`state:update` does **not** distinguish:

- local vs inbound apply
- diff vs full-sync apply

Applications must infer from `diff` content or maintain local causality. This is **documented pressure**, not a bug, until Phase 2 ergonomics address it.

---

## Application-layer events

Examples derive `todo:*`, `workspace:*` from `state:update`. These are **not** runtime contracts.

Rules:

- May change shape without semver on core
- Must not require new core events
- Should document their own collapse limitations

---

## Semantic boundaries summary

```text
┌────────────────────────────────────────┐
│  Runtime guarantees                    │
│  OCC, convergence, Engine-only write   │
│  gap → full-sync, recovering rules     │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  App conventions (recommended)         │
│  top-level key partition, *Client      │
│  derived events, defensive read parse  │
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│  Not provided                          │
│  merge, dedup, actor, durable replay     │
└────────────────────────────────────────┘
```

---

## Evidence

- `test/openless-node.test.ts`
- `examples/shared-todo/run.ts`
- `examples/ai-workspace/run.ts`
- `PHASE_1_5_USAGE_DIARY.md`
