# Phase 1.5 — Validation Summary

Consolidated conclusion from real usage validation.  
**No further validation domains planned in Phase 1.5.**  
**No runtime redesign recommended.**

| Artifact | Role |
|----------|------|
| `examples/ai-workspace/` | Semantic-heavy replicated workspace |
| `examples/shared-todo/` | CRUD-heavy multi-user collaboration |
| `PHASE_1_5_USAGE_DIARY.md` | Ongoing friction log (O-01 … O-33) |
| `PHASE_1_5_AI_WORKSPACE_VALIDATION.md` | AI workspace detailed matrix |
| `test/openless-node.test.ts` | Invariant baseline (7 tests) |

**Commands:** `npm test` · `npm run example:ai-workspace` · `npm run example:shared-todo`

---

## 1. Validation Scope

### Completed

| Example | Domain stress | Nodes | What it exercises |
|---------|---------------|-------|-------------------|
| **`examples/ai-workspace`** | Semantic-heavy workspace collaboration | planner, coder, ui | Multi-role top-level domains (`context`, `task`, `files`, `artifacts`, …); handoff; `recovering` rules; concurrent `context` overwrite |
| **`examples/shared-todo`** | CRUD-heavy multi-user collaboration | userA, userB, observer | Todo CRUD, assign, complete; presence; same-todo concurrent edit; lag; duplicate payload |

Both use **only** `OpenLessNode` for writes, `node.store.getState()` for reads, `InMemorySyncHub` for in-process mesh, and **application-layer** event bridges derived from runtime `state:update`.

### Not in scope (intentionally)

- New validation domains or products
- `core/*` changes, transport, WAL, CRDT, orchestration, agent frameworks
- UI productization
- Performance / scale benchmarks

---

## 2. Runtime Properties Confirmed

Properties observed in **both** examples and backed by `npm test` (7/7):

| Property | Evidence |
|----------|----------|
| **`OpenLessNode` as sole runtime entry** | All mutations via `applyLocal`; inbound via `handleInbound` on peers only through hub wiring |
| **Multi-node convergence** | 2–3 node mesh; end-state checksum / fingerprint match after every scenario step |
| **Observer viability** | `observer` / `ui` nodes: no writes; local view via derived app events + `getState()` |
| **Lag → full-sync → convergence** | `store.resetState` simulates lag; gap triggers full-sync; all replicas align |
| **Recovery boundary** | `status: recovering` rejects illegal domain writes; `recovery.*` keys accepted (ai-workspace V4b) |
| **Multi-writer survivability** | Different todos / separated top-level keys: no divergence; same-key conflict → LWW but still converged |
| **Application-layer event derivation** | `workspace-events.ts` / `todo-events.ts` build `todo:*` / `workspace:*` from `state:update` without new core events |

### Positive mitigations (app convention, not runtime guarantees)

- Partition writes by **top-level `data` key** (planner vs coder domains; different todo ids) avoids overwrite when writers do not share a key.
- Thin `*Client` wrappers keep `applyLocal` call sites readable.

---

## 3. Repeated Frictions

Merged from `PHASE_1_5_USAGE_DIARY.md` — appeared in **both** ai-workspace and shared-todo unless noted.

| Friction | Both domains? | One-line description |
|----------|---------------|----------------------|
| **applyLocal awkwardness** | Yes | Boolean-only result; manual `StateDiff` + `timestamp`; full top-level blobs per change |
| **state:update semantic collapse** | Yes | Same event for local apply, inbound replicate, and full-sync; no writer/locality metadata |
| **Last-write-wins overwrite cognition** | Yes | Stale read + concurrent `applyLocal` on same top-level key → silent winner, no conflict event |
| **Recovery readability** | Yes | Lag needs `store.resetState`; `sync:complete` on lagged replica only; observers often see `state:update` only |
| **Observer node semantics** | Yes | Derived app events use **observer** `nodeId`, not the writing peer |
| **Duplicate replay / idempotency** | Yes | Identical `applyLocal` payload still increments `version`; no op-id dedup |
| **Coarse diff granularity** | Yes | Shallow merge on `data`; nested maps (e.g. whole `todos`) replaced per write |
| **Schema friction** | Yes | `data: any`; app-side parse/coerce; empty `schemas/` |
| **Bypass risk** | shared-todo noted | `index.ts` exports lower-level types — discipline required |
| **Per-node error visibility** | ai-workspace | `error:transition` on writer bus, not observer bus |

**Worse than expected (still non-blocker):** silent LWW when product mental model expects merge or conflict notification.

---

## 4. Classification

### These frictions are **Phase 2 ergonomics / semantic pressure backlog**

| Backlog theme | Examples |
|---------------|----------|
| Typed read/write helpers on `OpenLessNode` | `getWorkspace()` / `applyPatch(domain)` |
| Richer apply result | `{ ok, reason }` instead of `boolean` |
| Event semantics | actor, causation, local vs inbound vs full-sync |
| Optional op id / dedup | tool retries, duplicate delivery |
| Schema | zod at `applyTransition` boundary |
| Recovery UX docs | lag simulation API story (test-only `resetState` remains) |

### These are **not** runtime correctness failures (in Phase 1.5)

- Awkward developer experience
- Missing attribution on events
- LWW when keys collide
- No built-in CRDT / field-level merge

### Re-open runtime redesign **only if** future usage shows:

| Failure mode | Phase 1.5 observed? |
|--------------|---------------------|
| Convergence failure | **No** |
| Recovery failure (gap cannot realign) | **No** |
| Observer impossibility (cannot build read-only replica) | **No** |
| Unavoidable direct `StateStore` mutation for normal workflows | **No** (except deliberate lag simulation) |
| Cannot express common domain workflow via `OpenLessNode` only | **No** |

**Decision rule tally:** **0** entries qualify for redesign (see diary §3).

---

## 5. Decision

| Action | Status |
|--------|--------|
| **STOP** runtime refactor | **Yes** — Phase 1 runtime frozen |
| **STOP** adding validation domains for now | **Yes** |
| **KEEP** `phase1-runtime-frozen` (or equivalent) as baseline | **Yes** |
| **KEEP** `phase1.5-validation` branch for diary + examples | **Yes** |
| **DO NOT** introduce CRDT / WAL / event sourcing / orchestration / transport expansion | **Yes** — until Phase 2+ planning |

Friction is **recorded**, not fixed, in Phase 1.5 consolidation.

---

## 6. Next Mode

### Long-running usage diary mode

| Do | Do not |
|----|--------|
| Re-run `npm run example:ai-workspace` and `npm run example:shared-todo` periodically | Add new domain examples |
| Append rows to `PHASE_1_5_USAGE_DIARY.md` | Change `core/*` without invariant regression |
| Improve docs only (README, ARCHITECTURE pointers) | Redesign sync / Engine / inbound pipeline |
| Optional: small new **steps** inside existing `run.ts` scripts | New systems (transport, WAL, agents) |

**Gate for any core change:** `npm test` fails, or a diary entry meets the §4 structural failure criteria **after** repeated observation.

---

## 7. CEO Summary

**Current conclusion**

OpenLess has passed first real usage validation across two domains: a multi-agent AI workspace and a shared multi-user todo board. In both cases, three logical nodes converged on the same state after normal collaboration, after simulated lag, and after recovery-style flows. Automated invariant tests continued to pass.

The runtime abstraction—single entry through `OpenLessNode`, replicated state via in-process mesh—is **stable enough** for collaborative replicated workspace use at prototype scale. Current problems are **semantic and ergonomic** (how events read, how diffs are shaped, last-write-wins on shared keys), not **correctness** (nodes failing to sync or diverging permanently).

**No runtime redesign is recommended now.** Next work should favor documentation, repeated runs, and a Phase 2 backlog (schema, ergonomics, persistence, transport) only when explicitly planned—not reactive refactors from friction alone.

---

## Related documents

```text
PHASE_1_5_VALIDATION_SUMMARY.md   ← this file (stage conclusion)
PHASE_1_5_USAGE_DIARY.md          ← living friction log
PHASE_1_5_AI_WORKSPACE_VALIDATION.md
PHASE_1.5_VALIDATION.md           ← legacy shared-todo notes
ARCHITECTURE.md                   ← Phase 1 frozen invariants (§2)
```
