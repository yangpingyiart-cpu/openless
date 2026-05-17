# Phase 1.5 — Real Usage Validation

> **Scenario:** shared todo board (two collaborators, replicated state)  
> **Code:** `examples/shared-todo/run.ts`  
> **Rule:** writes only via `OpenLessNode.applyLocal`; transport via `InMemorySyncHub` + public events. No sync internals.

```bash
npm run example:shared-todo
```

---

## What we built

| Piece | Role |
|-------|------|
| `todo-model.ts` | App-level board shape (`todos`, `nextId`) → `StateDiff` |
| `SharedTodoClient` | Thin wrapper: `add` / `toggle` → `node.applyLocal` only |
| `run.ts` | Alice/Bob linked nodes; add, toggle, lag + catch-up |

**Flows exercised:** local mutation, inbound replication, `state:update` subscription, gap → `sync:request` → `sync:complete`, full-board shallow merge in `data`.

---

## Awkward APIs

| Issue | Observation |
|-------|-------------|
| **No app-level read helper on `OpenLessNode`** | Must use `node.store.getState()` and parse `data` yourself; blurs “runtime vs app” boundary. |
| **Whole-document diffs for structured state** | Each todo change rebuilds `{ todos, nextId }` blob; natural CRUD wants field-level or patch ops. |
| **`applyLocal` → boolean only** | On failure, must separately subscribe to `error:transition` to learn why; no returned reason. |
| **Lag simulation uses `store.resetState`** | Not a runtime API; tests/demos use Store directly to fake partition — easy to misuse in “real” apps. |
| **`timestamp` on every diff** | App must supply; no runtime default or ordering tie-break beyond version. |
| **Public surface includes low-level exports** | `index.ts` still exports `DeltaSyncer`, `TransitionEngine`, etc.; temptation to bypass `OpenLessNode` in app code. |

---

## Missing invariants (from app perspective)

| Gap | Impact |
|-----|--------|
| **No schema / shape guarantee on `data`** | `readBoard()` defensively coerces; malformed peer state could slip through full-sync. |
| **No idempotency key on mutations** | Retrying the same logical “add todo” creates duplicate ops if framed as new diffs (we rely on OCC version, not op id). |
| **No “read-only replica” mode** | Cannot express follower that only applies inbound. |
| **No merge semantics for concurrent edits** | Two users edit different keys in same blob → last write wins on shallow merge of top-level keys only; editing nested `todos` without full snapshot risks stale overwrites (we avoided by always sending full `todos` object). |
| **No backpressure / queue on `handleInbound`** | Sync handler runs synchronously in-process; real apps may need async boundary (recorded, not a Phase 1 bug). |

---

## Event friction

| Event | Friction |
|-------|----------|
| `state:update` | Fires for **both** local and inbound applies (and full-sync via `applyFullSync`); UI must filter by intent or diff content. |
| `diff:received` | Not used in app (low-level); apps must choose between `state:update` vs sync events. |
| `sync:request` / `sync:complete` | Good for ops logging; no structured “recovery finished” app callback on `OpenLessNode`. |
| **Unsubscribe lifecycle** | `EventBus` requires same function reference; awkward for short-lived UI components (not demonstrated here). |
| **No correlation id** | Cannot tie a local `applyLocal` to a specific inbound echo on peer. |

---

## Recovery pain

| Scenario | Experience |
|----------|------------|
| **Gap (Bob reset to v0)** | Works: `sync:request` → full-sync → boards match. App did not need sync internals. |
| **Full-sync replaces entire `data`** | Correct for todo board; any **local uncommitted draft** on Bob would be wiped (expected for authoritative snapshot). |
| **`recovering` status unused** | Todo app never set `status: recovering`; recovery rules untested in this scenario. |
| **Illegal diff while recovering** | Not exercised; would need `initialState: { status: "recovering" }` + inbound diff — deferred. |
| **Partial failure on `applyLocal`** | Silent `false` unless `error:transition` wired (we wired logging). |

---

## Schema friction

| Topic | Notes |
|-------|--------|
| **`data: Record<string, any>`** | Todo model lives entirely in app layer; runtime does not know `todos` vs `nextId`. |
| **Shallow merge** | `mutation.data` merges top-level keys only; nested `todos[id]` updates require replacing whole `todos` map. |
| **No zod** | `schemas/` empty; validation is manual in `readBoard()`. |
| **Full-sync snapshot** | Peer must send JSON-serializable `GlobalState`; fine for todo board, unclear for large graphs. |
| **Version vs app epoch** | App `nextId` is data, not tied to `GlobalState.version`; gap recovery realigns board but app must not reuse ids incorrectly after fork (we re-sync full board so safe). |

---

## What felt natural

- **`OpenLessNode` + `applyLocal`** — maps cleanly to “user action on this replica”.
- **`InMemorySyncHub.link`** — minimal wiring for two-user validation without touching `SyncPeer` impl.
- **Convergence after lag** — gap path “just works” for product-less validation.
- **Separation of protocol vs app** — app only builds `StateDiff`; did not need `publishDiff` / sequencing APIs.

---

## Runtime issues found?

**None that break invariants** in this scenario. Tests still pass; example exits 0 when converged.

Documented frictions above are **ergonomic / Phase 2+** (schema, patch diffs, app helpers), not calls to refactor Phase 1 core immediately.

---

## Recommended next steps (record only — do not implement here)

1. **Phase 2:** optional `OpenLessNode.onStateUpdate` / typed payload helpers; zod on `StateDiff`.
2. **Phase 1.5 follow-ups (optional):** second scenario (e.g. `recovering` + replay) or three-node todo mesh.
3. **Architecture iteration:** only if a new scenario **fails** `npm test` or convergence — then fix invariant, not API polish.

---

## Phase 2 boundary (unchanged)

Still out of scope: transport adapters, WAL, CRDT redesign, agents/workflow, sync internals refactor.
