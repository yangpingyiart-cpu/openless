# OpenLess — Semantics

> Normative semantics for **validated** runtime behavior only.  
> Does not describe planned features. See [ERGONOMICS_BACKLOG.md](./ERGONOMICS_BACKLOG.md) for non-normative DX items.

---

## 1. Mutation semantics

### 1.1 Authority

| Rule | Normative |
|------|-----------|
| Store writes on runtime path | **MUST** occur only inside `TransitionEngine` after `applyTransition` or `applyFullSync` |
| Local initiation | **MUST** use `OpenLessNode.applyLocal` |
| Remote initiation | **MUST** use `OpenLessNode.handleInbound` |
| Application direct `store.applyDiff` | **MUST NOT** on production paths (test lag simulation excepted) |

The **authority** for whether a mutation is accepted is `TransitionEngine` (validation + rules). The **authority** for replica contents after gap is the peer snapshot in full-sync.

### 1.2 `applyTransition`

On success:

1. `StateStore.applyDiff(diff)` — shallow merge `mutation.data`; `version++`; apply `mutation.status` if provided  
2. Emit `state:update` with `state`, `previousState`, `diff`

On failure:

1. Emit `error:transition`  
2. Store **MUST NOT** change  
3. `applyLocal` **MUST** return `false` and **MUST NOT** call `publishDiff`

### 1.3 `applyFullSync`

On success:

1. `StateStore.resetState` from peer snapshot (structural validation only)  
2. Emit `state:update`  
3. On inbound path, emit `sync:complete` after apply

Business transition rules (e.g. recovery rule) **MUST NOT** run on full-sync payload. Peer snapshot wins.

### 1.4 `mutation.data` merge model

- Merge is **shallow** at top level of `data` only  
- Nested objects are replaced as a whole when their top-level key is present in `mutation.data`  
- There is **no** deep merge, **no** CRDT, **no** field-level patch operator in core

---

## 2. Overwrite model

### 2.1 Last-write-wins (LWW)

When two mutations target the **same top-level key** in `data` (whether concurrent or sequential stale reads):

- The mutation that is applied last on a given replica determines that key's value  
- All replicas **MUST** converge to the same value after sync (validated)  
- Runtime **MUST NOT** emit a conflict event  
- Runtime **MUST NOT** merge concurrent partial updates

This is **guaranteed behavior**, not a bug.

### 2.2 Avoiding overwrite (application)

Applications **SHOULD** partition writers by top-level key or by whole-state snapshots per writer domain. This is **not** enforced by runtime.

---

## 3. Ordering semantics

### 3.1 Per-replica version order

- `version` **MUST** increase by 1 per successful `applyDiff`  
- Total order of applied mutations on one replica is reflected by `version`

### 3.2 Cross-replica ordering

- Replicas **MUST** accept inbound diff only when `incoming.version === local.version + 1`  
- There is **no** global logical clock, **no** vector clock, **no** leader serialization

### 3.3 Concurrent `applyLocal` on different nodes

Order of application **is not guaranteed** before sync. After sync, all replicas **MUST** agree on resulting state (validated under mesh). **Not guaranteed:** preservation of intent when two writers conflict on one key.

---

## 4. Convergence semantics

### 4.1 Sequenced diff path

```text
incoming.version === local.version + 1
  → applyTransition(diff)
  → version local becomes incoming.version
```

### 4.2 Gap path

```text
incoming.version !== local.version + 1
  → diff NOT applied
  → diff:received { applied: false }
  → sync:request → peer full-sync
  → applyFullSync(peer state)
```

### 4.3 What convergence means here

After operations complete on a connected mesh:

- All replicas **MUST** have identical `version`, `status`, and `data` (validated via checksum in examples)

**Not guaranteed:**

- All replicas observed the same event sequence  
- Intermediate states were visible in the same order on every replica  
- Convergence without full-sync if transport never delivers full-sync response

---

## 5. Observer semantics

### 5.1 Definition

An **observer** is a replica that **MUST NOT** call `applyLocal`. It **MAY** subscribe to `node.bus` and **MUST** read via `node.store.getState()`.

### 5.2 Observer replicas — validated surfaces (not continuity guarantees)

- Final state **MUST** match writer replicas after convergence (validated)  
- `state:update` **MUST** fire on that replica for each change applied there  
- Application-derived events **MAY** be built from `state:update`

### 5.3 Not guaranteed for observers

| Topic | Status |
|-------|--------|
| `sync:complete` delivery | **Not guaranteed** on observer |
| `sync:request` visibility | **Not guaranteed** |
| `error:transition` for writes on other nodes | **Not guaranteed** |
| Correct `nodeId` as writer in app-derived events | **Not guaranteed** — bridge uses observer's `nodeId` |
| Distinguishing local vs remote apply in `state:update` | **Not guaranteed** |

---

## 6. Recovery semantics

### 6.1 `status: recovering` (default rule)

While `status === recovering`:

- `data` keys **MUST** be `recovery` or `recovery.*` prefix only (or absent)  
- `status` in mutation **MAY** be `active` or `error`  
- Other mutations **MUST** be rejected with `error:transition`

### 6.2 Full-sync as recovery

Full-sync **MUST** replace entire `GlobalState` with peer snapshot. Local uncommitted work on lagging replica **is not preserved**. This is **guaranteed** behavior of `resetState`.

### 6.3 Lag simulation (tests only)

Examples simulate lag via `node.store.resetState`. This **is not** a normative recovery API. **Outside runtime boundary** for production semantics.

---

## 7. State visibility semantics

| Action | Visible to local subscribers |
|--------|------------------------------|
| Successful `applyTransition` | `state:update` immediately |
| Rejected transition | `error:transition` only; no `state:update` |
| Successful `applyFullSync` | `state:update`; `sync:complete` on handling replica |
| `publishDiff` | `diff:broadcast` on origin |
| Inbound diff handled | `diff:received`; possibly `state:update` if applied |

`getState()` **MUST** return a clone of current Store state (implementation: `structuredClone` in Store).

There is **no** subscription to partial keys or paths. **Outside runtime boundary.**

---

## 8. Idempotency and replay

### 8.1 Not idempotent (guaranteed non-behavior)

Submitting the same `StateDiff` twice via `applyLocal` when both succeed **MAY** increment `version` twice and **MAY** re-apply merge effects. Runtime **MUST NOT** deduplicate by payload hash or op id.

### 8.2 Inbound replay

Delivering the same `diff` message when local version already advanced **MUST NOT** apply via sequenced path (version mismatch). Behavior **MAY** trigger gap / full-sync path. **Not guaranteed** to be a no-op without side effects on version.

### 8.3 No replay log

Runtime **MUST NOT** provide append-only history replay on startup. **Outside runtime boundary.**

---

## 9. Failure and restart behavior

| Event | Semantics |
|-------|-----------|
| Process exit | All state lost — **guaranteed** (memory store) |
| `applyLocal` returns false | No fan-out; Store unchanged — **guaranteed** |
| Invalid full-sync payload | Store unchanged; `error:transition` — **guaranteed** (tested) |
| Transport disconnect | **Not specified** — no reconnect semantics in core |
| Partial mesh | **Not guaranteed** to converge |

Restart behavior is **outside runtime boundary** until persistence exists (not in repository).

---

## 10. Event semantic collapse

`state:update` **MUST** be emitted for:

- Local successful `applyTransition`  
- Inbound successful `applyTransition`  
- Successful `applyFullSync`

Runtime **MUST NOT** currently tag which case occurred. Applications **MUST** treat this as a single channel or inspect `diff` / maintain local context.

This is documented pressure; changing it **would** be a semantic change (not listed in ergonomics backlog without review).

---

## 11. Related documents

| Doc | Content |
|-----|---------|
| [SPEC.md](./SPEC.md) | Guarantees and boundary |
| [NON_GOALS.md](./NON_GOALS.md) | Exclusions |
| [ERGONOMICS_BACKLOG.md](./ERGONOMICS_BACKLOG.md) | DX only |
| [docs/runtime/RUNTIME_LAWS.md](./docs/runtime/RUNTIME_LAWS.md) | Descriptive laws (Phase 1.6; not normative) |
| [docs/runtime/SEMANTIC_FAILURE_MODES.md](./docs/runtime/SEMANTIC_FAILURE_MODES.md) | Protocol vs cognition taxonomy (descriptive) |
| [docs/runtime/GUARANTEE_MATRIX.md](./docs/runtime/GUARANTEE_MATRIX.md) | Guaranteed / not guaranteed surfaces (descriptive) |

Evidence: `test/openless-node.test.ts`, Phase 1.5 examples.
