# Runtime Model

Formal model of the **frozen Phase 1** runtime. Describes what exists in `core/` today, not planned extensions.

---

## Layer stack

```text
┌─────────────────────────────────────────┐
│  Application (examples/, your app)     │
│  *Client, *EventBridge, domain models   │
└─────────────────┬───────────────────────┘
                  │ applyLocal / handleInbound
                  │ getState()
┌─────────────────▼───────────────────────┐
│  OpenLessNode (façade)                  │
└─────┬───────────────────────┬───────────┘
      │                       │
      ▼                       ▼
┌─────────────┐       ┌──────────────┐
│ Transition  │       │ DeltaSyncer  │
│ Engine      │       │ (protocol)   │
└──────┬──────┘       └──────┬───────┘
       │                     │ SyncPeer.send
       ▼                     ▼
┌─────────────┐       remote handleInbound
│ StateStore  │
│ EventBus    │
└─────────────┘
```

---

## Component responsibilities

| Component | Owns | Does not own |
|-----------|------|----------------|
| **OpenLessNode** | Orchestration: local vs inbound path; when to call Engine vs Syncer signals | Domain schema; transport implementation |
| **TransitionEngine** | `validateDiff`, transition rules, `applyTransition`, `applyFullSync`, `state:update` / `error:transition` | Network; version gap handling |
| **StateStore** | `GlobalState` memory; `applyDiff` (version++); `resetState` | Validation rules; fan-out |
| **DeltaSyncer** | OCC check (`isSequenced`); `publishDiff`; gap/full-sync **signaling**; sync events | Store mutation; transition rules |
| **EventBus** | In-process pub/sub | Persistence; cross-process delivery |
| **SyncPeer** | Deliver `SyncMessage` to peer | Apply diffs; interpret domain |

**Invariant:** Only `TransitionEngine` mutates `StateStore` on the runtime path.

---

## Core types

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

`mutation.version` in a diff is **ignored** on apply; Store always increments `version` by 1 on `applyDiff`.

---

## Write paths

### Local: `applyLocal(diff)`

```text
applyTransition(diff)
  → fail: error:transition, return false
  → ok:   store.applyDiff, state:update
publishDiff(diff, currentVersion)
  → diff:broadcast, SyncPeer.send(diff)
```

### Inbound: `handleInbound(message, fromPeerId)`

| Message | Behavior |
|---------|----------|
| `diff` | If sequenced → `applyTransition`; else `diff:received(false)` + `requestFullSync` |
| `full-sync-request` | `respondFullSync` (read-only snapshot from Store) |
| `full-sync` | `applyFullSync(peerState)` → `resetState` + `state:update` + `sync:complete` |

Transport adapters **must** call `handleInbound` only. They **must not** call `TransitionEngine` or `StateStore` directly.

---

## Sync protocol (DeltaSyncer)

| Message | Purpose |
|---------|---------|
| `diff` | `VersionedDiff { version, diff }` — source version **after** apply on origin |
| `full-sync-request` | Requester fell behind or gap |
| `full-sync` | Authoritative `GlobalState` snapshot |

Sequencing rule:

```text
accept diff apply  iff  incoming.version === local.version + 1
else               →  full-sync path
```

DeltaSyncer does **not** persist messages, deduplicate by op id, or reorder out-of-order diffs beyond this rule.

---

## Default recovery rule

When `status === "recovering"`:

- Allowed `data` keys: `recovery`, `recovery.*`
- Allowed `status` transitions: `active`, `error` (or unchanged)
- Violations → `error:transition`, no Store write

Full-sync does **not** run business rules; peer snapshot is structurally validated only.

---

## Public API surface

Entry: `index.ts` exports `OpenLessNode`, `InMemorySyncHub`, types, and events.

**Recommended:** applications use `OpenLessNode` only.

Lower-level exports exist for tests and demos; bypassing the façade is discouraged.

---

## Deployment shape (Phase 1)

| Property | Value |
|----------|-------|
| Process model | Library; no daemon |
| Storage | Memory only |
| Multi-node in repo | `InMemorySyncHub.mesh` (same OS process) |
| Tests | `test/openless-node.test.ts` (7 invariants) |

---

## Relationship to other docs

- Semantics (events, LWW, observer): [semantic-model.md](./semantic-model.md)
- What we will not build: [non-goals.md](./non-goals.md)
- Phase 2 work items: [phase2-backlog.md](./phase2-backlog.md)
