# Runtime Positioning

> Status: **Phase 1 frozen** + **Phase 1.5 validated**  
> Audience: contributors planning Phase 2 without expanding runtime scope by default  
> **Authority:** scenario fit and one-liner definition live in [POSITIONING.md](../POSITIONING.md) (root). This file is supporting context only — not normative contract.

OpenLess is an **in-memory, replicated state runtime** for collaborative logical nodes. It is not a message bus, database, agent framework, or UI platform.

---

## What OpenLess is

| Claim | Meaning |
|-------|---------|
| **Stateful runtime** | Each node holds one authoritative `GlobalState` per replica |
| **Single entry** | `OpenLessNode.applyLocal` / `handleInbound` are the only supported mutation paths |
| **OCC + delta sync** | Integer `version`; sequenced diffs; gap triggers full-sync |
| **Rule-gated writes** | `TransitionEngine` validates structure and runs transition rules before Store writes |
| **Transport-agnostic protocol** | `SyncPeer` delivers `SyncMessage`; core owns sequencing, not sockets |

Validated at prototype scale (2–3 nodes, in-process mesh, two usage domains).

---

## What OpenLess is not

See [non-goals.md](./non-goals.md) for the full list. Short form:

- Not CRDT / OT / automatic merge
- Not durable (no WAL in Phase 1)
- Not cross-process production transport (only `InMemorySyncHub` in repo)
- Not workflow or agent orchestration
- Not a schema-validated document store (app owns `data` shape)

---

## Intended workloads

Workloads **validated** in Phase 1.5:

| Workload | Example | Fit |
|----------|---------|-----|
| **Multi-writer collaborative state** | Shared todo, AI workspace fields | Good when writers partition top-level `data` keys or accept LWW on shared keys |
| **Read-only observers** | UI / monitor replica | Good via `state:update` + `getState()` + app-derived events |
| **Lag recovery** | Node behind many versions | Good via gap → full-sync → convergence |
| **Recovery window** | `status: recovering` + `recovery.*` writes | Good for checkpoint-style gates |

Workloads **not validated** (may need Phase 2+ infra):

- Large blob state (MB+ per diff)
- High-frequency presence heartbeats (version churn)
- Cross-datacenter mesh
- Exactly-once side effects from tool runs
- Fine-grained concurrent edit on nested fields without whole-map replace

---

## Positioning vs adjacent systems

| System type | OpenLess difference |
|-------------|---------------------|
| **Key-value store** | No ad-hoc key API; all writes are versioned diffs through Engine |
| **Event sourcing log** | Events notify; Store is snapshot + version, not immutable log replay (Phase 1) |
| **Redis Pub/Sub** | Pub/sub is transport; OpenLess adds OCC, rules, and convergence |
| **CRDT doc** | OpenLess does not merge concurrent edits; last write wins on shallow keys |
| **Agent runtime** | Agents are app layer; they call `applyLocal`, not built-in |

---

## Stability stance (Phase 2 planning)

```text
clarity       > extensibility
stability     > abstraction
semantics     > infrastructure
```

Phase 2 **may** add ergonomics and persistence **without** changing frozen invariants unless `npm test` and diary structural-failure rules demand it.

---

## Document map

| Doc | Topic |
|-----|--------|
| [runtime-model.md](./runtime-model.md) | Components and responsibilities |
| [semantic-model.md](./semantic-model.md) | State, events, convergence, recovery, observer |
| [non-goals.md](./non-goals.md) | Explicit exclusions |
| [phase2-backlog.md](./phase2-backlog.md) | Planned pressure, not commitments |

Evidence: `PHASE_1_5_VALIDATION_SUMMARY.md`, `test/openless-node.test.ts`.
