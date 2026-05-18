# OpenLess — Ergonomics Backlog

> **This is not a roadmap.**  
> **This is not a commitment.**  
> Items here **MUST NOT** be interpreted as planned releases, guarantees, or architecture expansion.

Each entry records **developer ergonomics** pressure observed in Phase 1.5. Adoption **MAY** never occur.

---

## 1. How to read this document

Every item **MUST** satisfy all three labels:

| Label | Meaning |
|-------|---------|
| **Improves usability** | Easier to integrate, read, or debug |
| **Does not change runtime semantics** | [SEMANTICS.md](./SEMANTICS.md) remains true without amendment |
| **Does not expand runtime responsibility** | No new subsystem, no new guarantees |

If an item would change LWW, convergence rules, OCC, or event meanings, it **MUST NOT** appear here — it belongs in a future spec revision process, not ergonomics.

---

## 2. Backlog items

### E-01 — Richer `applyLocal` result

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — single call returns `{ ok, reason? }` |
| **Does not change runtime semantics** | Yes — same accept/reject outcomes |
| **Does not expand runtime responsibility** | Yes — surface only |

**Observed:** `boolean` only; reason requires `error:transition` subscription.  
**Evidence:** shared-todo, ai-workspace (O-01).

---

### E-02 — Typed read helper on `OpenLessNode`

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — less direct `store` access |
| **Does not change runtime semantics** | Yes — read path unchanged |
| **Does not expand runtime responsibility** | Yes — optional helper |

**Observed:** Apps parse `data` manually.  
**Evidence:** O-05, O-12.

---

### E-03 — Default `timestamp` on diff

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — fewer boilerplate fields |
| **Does not change runtime semantics** | Yes — if default is `Date.now()` at apply time |
| **Does not expand runtime responsibility** | Yes |

**Observed:** Every `StateDiff` needs `timestamp`.  
**Evidence:** O-07.

---

### E-04 — Document lag simulation pattern

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — clarifies test-only `resetState` |
| **Does not change runtime semantics** | Yes — documentation only |
| **Does not expand runtime responsibility** | Yes |

**Observed:** Lag uses `store.resetState`, not Node API.  
**Evidence:** O-06, O-30.

---

### E-05 — `state:update` cause tag (documentation or optional field)

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — disambiguate local / inbound / full-sync |
| **Does not change runtime semantics** | **Only if** additive optional metadata; **no** if it alters required payload shape without version bump |

**Status:** Requires spec review before implementation. Listed as **documentation-first** (describe inference from `diff` today).

**Observed:** Semantic collapse on `state:update`.  
**Evidence:** O-02, O-03.

**Note:** A mandatory new field on payload **would** be a semantic/API change — **not** approved in this backlog as stated.

---

### E-06 — Application event bridge examples in repo

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — copy patterns from `todo-events.ts` |
| **Does not change runtime semantics** | Yes — app layer |
| **Does not expand runtime responsibility** | Yes |

**Observed:** Every app hand-rolls bridge from `state:update`.  
**Evidence:** O-16, O-28.

---

### E-07 — Narrow `index.ts` export surface documentation

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — warns against Engine bypass |
| **Does not change runtime semantics** | Yes |
| **Does not expand runtime responsibility** | Yes |

**Observed:** `TransitionEngine` exported.  
**Evidence:** O-13.

---

### E-08 — Observer integration guide (docs only)

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — what to expect from sync events |
| **Does not change runtime semantics** | Yes |
| **Does not expand runtime responsibility** | Yes |

**Observed:** `sync:complete` often missing on observer.  
**Evidence:** O-18, O-30.

---

### E-09 — Zod schema at Engine boundary (optional dependency)

| Field | Value |
|-------|-------|
| **Improves usability** | Yes — fail fast on shape |
| **Does not change runtime semantics** | **Only if** validation rejects same diffs Engine already rejects |
| **Does not expand runtime responsibility** | Debate — adds validation layer |

**Status:** Deferred for spec review. Stricter rejection **would** change semantics. Looser-only wrapper **MAY** qualify later.

**Observed:** `data: any`.  
**Evidence:** O-12.

---

## 3. Explicitly excluded from ergonomics backlog

These **MUST NOT** be filed here:

| Item | Why excluded |
|------|--------------|
| CRDT / merge | Semantic change — [NON_GOALS.md](./NON_GOALS.md) |
| Op-id dedup in core | Semantic change |
| Persistence / WAL | Infrastructure — outside ergonomics |
| Transport adapters | Infrastructure |
| Workflow / agents | Product layer |
| Conflict events | Semantic change |

---

## 4. Process

| Rule | Detail |
|------|--------|
| New items | Append with three labels + evidence ID |
| Implementation | Requires explicit ticket; **not** implied by listing |
| Completion | Remove or mark done; **do not** auto-bump spec version |

---

## 5. Related documents

| Doc | Role |
|-----|------|
| [PHASE_1_5_USAGE_DIARY.md](./PHASE_1_5_USAGE_DIARY.md) | Raw observations |
| [SPEC.md](./SPEC.md) | Normative guarantees |
| [NON_GOALS.md](./NON_GOALS.md) | Hard exclusions |
