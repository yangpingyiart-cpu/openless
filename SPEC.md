# OpenLess — Specification

> **Status:** Phase 1 frozen, Phase 1.5 validated  
> **Normative:** MUST / MUST NOT / SHOULD / MAY as defined in RFC 2119 sense (requirements on behavior and integration, not IETF standards compliance)

---

## 1. What OpenLess is

OpenLess is an **in-memory replicated state runtime** for TypeScript (Node.js). Each **logical node** holds one `GlobalState` replica. Nodes exchange versioned deltas and full snapshots through a pluggable **transport adapter** (`SyncPeer`).

OpenLess provides:

- A single mutation entry (`OpenLessNode`)
- Optimistic concurrency on integer `version`
- Transition validation and optional rules before writes
- A small sync protocol (diff, full-sync-request, full-sync)

OpenLess is a **library**, not a deployed distributed system. Validation used 2–3 nodes in one OS process via `InMemorySyncHub`.

---

## 2. What OpenLess is not

OpenLess is **not** a distributed system framework, consensus layer, CRDT store, workflow engine, message bus product, or cloud control plane. See [NON_GOALS.md](./NON_GOALS.md).

---

## 3. Runtime boundary

### 3.1 Inside the boundary (implemented in `core/`)

| Component | Role |
|-----------|------|
| `OpenLessNode` | Sole supported entry for local and inbound mutations |
| `TransitionEngine` | Validates diffs; runs rules; `applyTransition` / `applyFullSync` |
| `StateStore` | In-memory `GlobalState`; `applyDiff`; `resetState` |
| `DeltaSyncer` | Protocol: sequencing check, fan-out, gap/full-sync **signals** (no Store writes) |
| `EventBus` | In-process event dispatch |
| `SyncPeer` | Transport interface; `send(SyncMessage)` |
| `InMemorySyncHub` | In-process mesh wiring for tests and examples |

### 3.2 Outside the boundary (application responsibility)

- Shape and meaning of `GlobalState.data`
- Actor identity, UI, agents, scheduling
- Durability, networking, serialization format on the wire
- Derived application events (e.g. `todo:added` built from `state:update`)
- Lag simulation in tests (`store.resetState` on a node instance)

### 3.3 Integration rules

Applications **MUST** perform all business mutations through `OpenLessNode.applyLocal`.

Inbound messages from transport **MUST** be delivered only to `OpenLessNode.handleInbound(message, fromPeerId)`.

Applications **MUST NOT** call `TransitionEngine` or `StateStore.applyDiff` / `resetState` on the hot path except documented test hooks.

Transport adapters **MUST NOT** call `TransitionEngine` directly.

---

## 4. Intended usage

Validated usage patterns (Phase 1.5):

| Pattern | Description |
|---------|-------------|
| **Multi-writer collaboration** | Multiple nodes call `applyLocal`; replicas converge when diffs are sequenced or after full-sync |
| **Read-only observer** | A node subscribes to events and reads `store.getState()` without calling `applyLocal` |
| **Partitioned top-level keys** | Writers update different keys in `mutation.data` to reduce overwrite (app convention) |
| **Recovery window** | `status: recovering` with `recovery` / `recovery.*` data keys only (default rule) |

**MAY** use thin client wrappers (`TodoClient`, etc.) that only call `applyLocal`.

**MAY** use `InMemorySyncHub` for single-process multi-node tests and examples.

---

## 5. Runtime guarantees

The following are **guaranteed** for conforming use (as locked by `test/openless-node.test.ts` and Phase 1.5 examples):

| ID | Guarantee |
|----|-----------|
| G-1 | Successful `applyLocal` increases local `version` by exactly 1 |
| G-2 | Only `TransitionEngine` mutates `StateStore` on the runtime path (`applyTransition`, `applyFullSync`) |
| G-3 | `DeltaSyncer` does not call `applyDiff` or `resetState` |
| G-4 | Inbound diff is applied only if `incoming.version === local.version + 1` |
| G-5 | If G-4 fails, the diff is not applied; gap handling may request full-sync |
| G-6 | After successful full-sync, local state matches the peer snapshot (structurally valid) |
| G-7 | Failed validation or rule rejection does not mutate `StateStore` |
| G-8 | When `status === recovering` and default recovery rule is enabled, non-recovery mutations are rejected |

### 5.1 Convergence (guaranteed under validated conditions)

When all replicas are connected via a mesh that eventually delivers messages, and writers use `applyLocal` / `handleInbound` only:

- Replicas **MUST** reach identical `version`, `status`, and `data` after a bounded sequence of sequenced diffs and any required full-syncs.

Validated: 2-node and 3-node scenarios; not guaranteed for arbitrary network partitions or production transport failures (outside current validation).

---

## 6. Not guaranteed

The following are **implementation details** or **explicit non-guarantees**:

| Topic | Status |
|-------|--------|
| Merge of concurrent edits on same key | **Not guaranteed** — last write wins on shallow top-level keys |
| Idempotent logical operations | **Not guaranteed** — duplicate `applyLocal` may increment `version` again |
| Writer identity on events | **Not guaranteed** |
| `state:update` distinguishes local vs inbound vs full-sync | **Not guaranteed** |
| `sync:complete` on every replica | **Not guaranteed** — typically on the replica that applied full-sync |
| `error:transition` visible on all replicas | **Not guaranteed** — per-node `EventBus` |
| Durability across process restart | **Not guaranteed** — memory only |
| Cross-process transport | **Not guaranteed** — not in repository |
| Schema of `data` | **Not guaranteed** — `Record<string, any>` |
| Ordering of concurrent `applyLocal` on different nodes | **Not guaranteed** beyond OCC + LWW |
| Exactly-once side effects in application code | **Outside runtime boundary** |

---

## 7. Public API

**Normative entry:** `OpenLessNode` from package root (`index.ts`).

| Method | Use |
|--------|-----|
| `applyLocal(diff: StateDiff): boolean` | Local mutation + fan-out to peers |
| `handleInbound(message, fromPeerId): void` | Transport delivery |

Lower-level exports (`TransitionEngine`, `DeltaSyncer`, etc.) exist but **SHOULD NOT** be used for application mutations.

---

## 8. Core types (normative)

```ts
interface GlobalState {
  version: number;
  data: Record<string, any>;
  status: "active" | "recovering" | "error";
}

interface StateDiff {
  mutation: Partial<GlobalState>;
  timestamp: number;
}
```

`applyDiff` **MUST** ignore `mutation.version` if present and **MUST** set `version` to `previous + 1`.

---

## 9. Sync messages

| Type | Payload |
|------|---------|
| `diff` | `VersionedDiff { version, diff }` — `version` is source version **after** apply |
| `full-sync-request` | `{ requesterId }` |
| `full-sync` | `{ state: GlobalState }` |

---

## 10. Evidence and maintenance

| Artifact | Role |
|----------|------|
| `test/openless-node.test.ts` | Machine-checked guarantees G-1–G-8 |
| `examples/shared-todo/`, `examples/ai-workspace/` | Human usage validation |
| `PHASE_1_5_VALIDATION_SUMMARY.md` | Stage conclusion |
| `docs/runtime/RUNTIME_LAWS.md` | Descriptive laws (Phase 1.6; not normative contract) |

Semantic detail: [SEMANTICS.md](./SEMANTICS.md). Positioning: [POSITIONING.md](./POSITIONING.md). Observed failure modes: [docs/runtime/SEMANTIC_FAILURE_MODES.md](./docs/runtime/SEMANTIC_FAILURE_MODES.md).

Changes to guarantees **MUST** update tests and this document together.
