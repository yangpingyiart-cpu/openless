# Phase 1.5 — Replicated AI Workspace State Validation

> **Domain:** multi AI / multi-window / multi-tool shared workspace  
> **Code:** `examples/ai-workspace/`  
> **Run:** `npm run example:ai-workspace`  
> **Rule:** `OpenLessNode.applyLocal` only; no sync internals; no `core/*` changes

---

## Success criteria (this run)

| Criterion | Result |
|-----------|--------|
| Three-node end-state convergence | **PASS** (v17, identical fingerprint) |
| No runtime invariant failure | **PASS** (`npm test` 7/7) |
| No direct Store mutation on write path | **PASS** (lag simulation `resetState` only — recorded) |
| UI observer via events + `getState()` only | **PASS** |
| Recovery / lag → workspace realigns | **PASS** (V4 full-sync, V4b `recovering` rules) |

**Verdict:** Current runtime semantics **can support** a minimal AI workspace collaboration story. Friction is **ergonomic and semantic**, not convergence failure. **No architecture iteration required** from this experiment.

---

## Scenario coverage

| Step | What ran | Outcome |
|------|----------|---------|
| **V1** | Mesh `planner` / `coder` / `ui`; planner seeds | All v1, converged |
| **V2** | Planner: phase, context, task; coder: files, artifacts, tools, presence | v9, converged |
| **V3** | UI: derived app events + `state:update` only | 5 app events; snapshot matches |
| **V4** | Coder lag (`resetState` v0); planner context write | full-sync on coder; all v10 |
| **V4b** | Coder `recovering`; illegal `files` write; `recovery.*` step; `active` | Illegal rejected; converged v13 |
| **V5** | Stale-read concurrent `context` overwrite | Last writer: `"coder-stale-overwrite"` |
| **V6** | Duplicate identical `applyLocal` | v16→v17, phase `review` again |

---

## Friction matrix

Legend: **confirmed** | **not observed** | **worse than expected**

### applyLocal awkwardness

| Observation | Status |
|-------------|--------|
| Must build full top-level domain blobs (`context`, `task`, …) | **confirmed** |
| `applyLocal` returns `boolean` only; no rejection reason | **confirmed** |
| `timestamp` required on every diff | **confirmed** |
| No `applyPatch(domain, partial)` on `OpenLessNode` | **confirmed** |
| Planner/Coder split enforced only by app discipline | **confirmed** |

### state:update semantic collapse

| Observation | Status |
|-------------|--------|
| Local, inbound, and full-sync all emit `state:update` | **confirmed** |
| UI cannot distinguish “my write” vs “peer write” without diff inspection | **confirmed** |
| Derived app events attach **observer** `nodeId`, not writer | **confirmed** (worse for multi-agent attribution) |
| `state:update` version stream on UI: `1..17` with no actor metadata | **confirmed** |

### Recovery friction

| Observation | Status |
|-------------|--------|
| Lag simulation requires `store.resetState` (not Node API) | **confirmed** |
| `sync:complete` only on **lagged** replica (coder), not UI observer | **confirmed** |
| UI still converges via subsequent `state:update` / diff path | **confirmed** |
| `recovering` + illegal `files` write rejected (`applyLocal` false) | **confirmed** |
| Legal writes must use `recovery` / `recovery.*` keys only | **confirmed** |
| `error:transition` not visible on UI bus for coder’s illegal write | **confirmed** (observer limitation) |
| Full-sync replaces entire workspace snapshot | **confirmed** (acceptable for validation scale) |

### Concurrent overwrite ambiguity

| Observation | Status |
|-------------|--------|
| Stale read + two `applyLocal` on `context` → last write wins | **confirmed** |
| No CRDT / field-level merge | **not observed** as needed for **different** top-level keys in V2 (planner/coder wrote separate keys — no conflict) |
| Same-key concurrent conflict | **worse than expected** for AI “merge context” mental model — silent stomp |

### Coarse diff behavior

| Observation | Status |
|-------------|--------|
| Shallow merge on `mutation.data` top-level keys | **confirmed** |
| Replacing whole `artifacts` / `files` maps per write | **confirmed** |
| Large context would fan-out full blob | **confirmed** (not measured at scale) |
| `GlobalState.data` untyped (`any`) | **confirmed** |

### Observer ergonomics

| Observation | Status |
|-------------|--------|
| UI works with derived events + `getState()` | **confirmed** |
| `workspace:phase-changed`, `workspace:artifact-added` derivable | **confirmed** |
| `sync:request` / `sync:complete` invisible on observer for peer lag | **confirmed** |
| Must hand-roll `attachWorkspaceEventBridge` per replica | **confirmed** |
| No built-in “read-only replica” flag on `OpenLessNode` | **not observed** as blocker |

### Idempotency

| Observation | Status |
|-------------|--------|
| Identical `applyLocal` twice still increments version (v16→v17) | **confirmed** |
| No op / dedup by payload hash | **not observed** |
| Retry-safe tool runs would need app-level op ids | **confirmed** |

---

## What worked (natural enough)

- **`OpenLessNode` + role-specific clients** map cleanly to planner / coder / observer.
- **Domain-separated top-level keys** avoid nested merge bugs in V2.
- **Mesh + `applyLocal`** propagates artifacts and context without sync imports.
- **Gap → full-sync** restores three-way convergence after lag.
- **`recovering` rules** align with checkpoint narrative when keys are `recovery.*`.
- **App event bridge** on `state:update` is viable for UI refresh triggers.

---

## What did NOT break

- OCC / sequencing invariants (`npm test` unchanged).
- Three-node convergence after every phase.
- Observer never called `applyLocal`.

---

## Record-only recommendations (no action this phase)

| Item | Suggested phase |
|------|-----------------|
| Typed workspace read helper on Node | Phase 2 ergonomics |
| `applyLocal` result with `{ ok, reason }` | Phase 2 |
| Actor / causation metadata on diffs or events | Phase 2+ |
| Op id / dedup | Phase 2+ |
| Field-level patch or CRDT for `context` | Only if product requires — **not** proven necessary for minimal workspace |

---

## Phase 2 boundary (unchanged)

Do **not** infer from this experiment:

- Redis/Kafka transport
- WAL / persistence
- Workflow / agent framework
- Runtime redesign of DeltaSync or Engine

Proceed to Phase 2 only for **persistence + schema + transport** after explicit planning — not because workspace validation failed convergence.

---

## Files

| File | Role |
|------|------|
| `examples/ai-workspace/workspace-model.ts` | State shape + diffs |
| `examples/ai-workspace/workspace-client.ts` | Planner/Coder → `applyLocal` |
| `examples/ai-workspace/workspace-events.ts` | Derived app events |
| `examples/ai-workspace/run.ts` | V1–V6 script |
| `examples/ai-workspace/README.md` | How to run |
