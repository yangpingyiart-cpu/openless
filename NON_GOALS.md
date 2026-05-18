# OpenLess — Non-Goals

> What OpenLess **does not attempt to solve** in the current validated runtime.  
> These are **boundary choices**, not missing features to be ashamed of.

---

## 1. Purpose of this document

Readers **MUST** use this list to avoid misclassifying OpenLess as a general distributed platform. Items here are **out of scope** unless a future specification explicitly revokes an entry with new evidence and tests.

---

## 2. Distributed systems theory

| Non-goal | Clarification |
|----------|---------------|
| **Distributed consensus** | No Raft, Paxos, quorum commits, or leader election |
| **Linearizability across regions** | Only integer version + full-sync on gap |
| **Partition tolerance guarantees** | Not validated; in-memory mesh only |
| **Byzantine fault tolerance** | Not in scope |
| **Global ordering service** | No total order broadcast beyond peer fan-out |

OpenLess is a **replicated state library**, not a consensus system.

---

## 3. Conflict resolution

| Non-goal | Clarification |
|----------|---------------|
| **CRDT conflict resolution** | No automatic merge of concurrent structured edits |
| **Operational transformation** | Not in scope |
| **Multi-writer conflict arbitration** | LWW on shallow keys is the model; no conflict API |
| **Conflict events** | Runtime does not emit merge/conflict notifications |

Concurrent writers **MUST** be handled by application design or accepted LWW semantics ([SEMANTICS.md](./SEMANTICS.md) §2).

---

## 4. Orchestration and product layers

| Non-goal | Clarification |
|----------|---------------|
| **General-purpose orchestration** | No workflow coordinator in core |
| **Workflow engine** | No DAG, saga, or step runner |
| **Job scheduler** | No cron, queue workers, or task leasing |
| **Agent runtime** | `agents/` directory empty; agents are application code |
| **UI platform** | No components, rendering, or IDE integration |

Applications **MAY** orchestrate agents that call `applyLocal`; that orchestration is **outside runtime boundary**.

---

## 5. Infrastructure and platform

| Non-goal | Clarification |
|----------|---------------|
| **Durable message bus** | No Kafka/Redis/NATS implementation in repository |
| **Infra abstraction layer** | No cloud provider adapters |
| **Cloud control plane** | No deploy, scale, or health orchestration |
| **Kubernetes operator** | Not in scope |
| **Service mesh integration** | Not in scope |

`SyncPeer` is an interface hook only. Production networking is **outside runtime boundary**.

---

## 6. Data platform features

| Non-goal | Clarification |
|----------|---------------|
| **Durable storage / WAL** | Memory-only Store in validated runtime |
| **Event sourcing as source of truth** | Events notify; Store is snapshot |
| **Query engine / indexing** | No query API on `data` |
| **Schema enforcement in core** | `data` is untyped; validation is app or future optional layer |
| **Transactions across keys** | Single diff atomicity only |

---

## 7. API and semantics we deliberately omit

| Non-goal | Clarification |
|----------|---------------|
| **Idempotent op ids in core** | Version ≠ logical operation id |
| **Actor attribution on all events** | Not in validated behavior |
| **Read-only replica flag** | Convention: do not call `applyLocal` |
| **Deep merge** | Shallow top-level merge only |
| **Field-level patch DSL** | Application builds `StateDiff` |

---

## 8. Deleted integration paths (must not return)

These were removed in Phase 1 stabilization. Restoring them **MUST NOT** happen without a new specification and invariant suite.

| Path | Why excluded |
|------|--------------|
| `DeltaSyncer.broadcastDiff` | Wrote Store without Engine |
| `DeltaSyncer.receiveDiff` as mutation owner | Wrote Store without Engine |
| `handleInboundMessage` on Syncer owning apply | Bypassed `OpenLessNode` |
| Transport → `TransitionEngine` direct | Breaks single pipeline |
| Demo monkey-patch inbound | Masked dual path |

---

## 9. Comparison framing (not competitors)

OpenLess is **not** trying to be:

| System class | Why not |
|--------------|---------|
| **Kubernetes** | No cluster management |
| **Temporal / Cadence** | No durable workflow |
| **Redis** | No general KV or pub/sub product |
| **CRDT database** | No merge |
| **Event store (Kafka log)** | No durable log API |

Similarity to any product is incidental (replicated state, messages). Capability claims **MUST** cite [SPEC.md](./SPEC.md) guarantees only.

---

## 10. When a non-goal might be revisited

A non-goal **MAY** move to specification only if:

1. Documented in a new normative spec section  
2. `test/openless-node.test.ts` (or successor) encodes new guarantees  
3. Phase 1.5-style usage validation shows structural need, not mere DX  

Until then, requests in these categories are **outside runtime boundary** by design.

---

## 11. Related documents

| Doc | Role |
|-----|------|
| [SPEC.md](./SPEC.md) | What is in scope |
| [SEMANTICS.md](./SEMANTICS.md) | Observable behavior |
| [ERGONOMICS_BACKLOG.md](./ERGONOMICS_BACKLOG.md) | DX items that do not change this list |
