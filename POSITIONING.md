# OpenLess — Positioning

> Clarifies what problem OpenLess solves and what it deliberately leaves unsolved.  
> Not marketing copy. See [SPEC.md](./SPEC.md) for normative requirements.

---

## 1. One-sentence definition

OpenLess is a **minimal in-memory runtime** that keeps multiple replicas of one versioned application state convergent through sequenced diffs and full-sync, with all mutations gated by a single entry point and a transition engine.

---

## 2. Why boundary clarity matters more than feature breadth

OpenLess intentionally does **few** things:

- Hold state  
- Validate and apply mutations  
- Replicate with OCC  
- Recover from version gaps  

Breadth without validated semantics produces systems that **look** distributed but **behave** unpredictably under conflict, lag, or observer use.

Phase 1.5 validated that a narrow boundary is **usable** for:

- Multi-user CRUD-style collaboration (shared todo)  
- Multi-role workspace-style state (AI workspace example)  

Value comes from **predictable** behavior (convergence, single pipeline, explicit LWW), not from covering every distributed pattern.

---

## 3. Suitable scenarios

Applications **SHOULD** consider OpenLess when:

| Criterion | Fit |
|-----------|-----|
| State fits in memory on one machine per replica | Good |
| 2–N logical nodes, prototype or single-process mesh | Validated |
| Writers can partition `data` by top-level keys or accept LWW on shared keys | Good |
| Observers need read-only replicas via events + `getState()` | Validated |
| Gap recovery via authoritative snapshot is acceptable | Good |
| Rules on `status` (e.g. recovering) are useful | Validated |

**Examples of fit (validated in repo only):**

- Shared todo board with assign/complete  
- Replicated workspace fields (context, tasks, artifacts) with planner/coder/ui roles  

---

## 4. Unsuitable scenarios

Applications **SHOULD NOT** expect OpenLess to be sufficient when:

| Criterion | Reason |
|-----------|--------|
| Concurrent edits to same nested document need merge | LWW only — [SEMANTICS.md](./SEMANTICS.md) |
| Durability across restart required | Memory store — not guaranteed |
| Cross-machine production sync required today | No transport in repo |
| Exactly-once tool side effects required | No op-id dedup |
| Global workflow or saga coordination required | Outside boundary — [NON_GOALS.md](./NON_GOALS.md) |
| Need consensus or leader-elected writer | Not provided |
| Large binary payloads in state | Not validated; full blob fan-out |

These are **mismatch**, not invitations to extend OpenLess without a new spec phase.

---

## 5. What OpenLess is compared to common labels

| Label people use | Accurate? |
|------------------|-----------|
| State machine runtime | Partially — rules + status, not full FSM product |
| Replicated store | Yes — with OCC and full-sync |
| Event-sourced system | No — no durable log API |
| CRDT / collaborative editing | No |
| Message bus | No — messages are sync protocol, not product |
| Agent platform | No |
| Distributed framework | **No** — library; validated in-process mesh only |

---

## 6. Integration posture

Integrators **MUST**:

1. Treat `OpenLessNode` as the only mutation API  
2. Own `data` schema and merge strategy at app layer  
3. Derive product events from `state:update` if needed  
4. Accept LWW on conflicting top-level keys  

Integrators **MUST NOT**:

1. Assume CRDT, conflict UI, or durable replay from core  
2. Assume Kubernetes-, Temporal-, or Redis-level capabilities  
3. Bypass Engine via Syncer or Store on write paths  

---

## 7. Validation status (factual)

| Check | Result |
|-------|--------|
| Invariant tests | 7/7 pass (`test/openless-node.test.ts`) |
| Usage domains | 2 (shared-todo, ai-workspace) |
| Runtime redesign recommended | No (`PHASE_1_5_VALIDATION_SUMMARY.md`) |
| Structural failures | None recorded |

Future work **MAY** add persistence or transport as **separate** phases. That does not change current positioning.

---

## 8. Document map

| Document | Reader goal |
|----------|-------------|
| [SPEC.md](./SPEC.md) | Integrate correctly |
| [SEMANTICS.md](./SEMANTICS.md) | Predict behavior |
| [NON_GOALS.md](./NON_GOALS.md) | Avoid wrong expectations |
| [ERGONOMICS_BACKLOG.md](./ERGONOMICS_BACKLOG.md) | Known DX friction (non-commitment) |

Supporting evidence: `ARCHITECTURE.md`, `PHASE_1_5_VALIDATION_SUMMARY.md`, `PHASE_1_5_USAGE_DIARY.md`.
