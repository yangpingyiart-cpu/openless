# OpenLess Runtime Laws

Phase 1.6 — **claim discipline**, not an ontology of every friction.

**Status:** descriptive only. Does **not** authorize runtime redesign. Does **not** amend `SPEC.md` / `SEMANTICS.md`.

**Purpose of this file:** constrain what OpenLess may be said to guarantee — not explain every human confusion.

---

## Law admission criteria

A statement becomes an **admitted runtime law** only when **all** of the following hold:

| # | Criterion |
|---|-----------|
| 1 | **Cross-session repeat** — same outcome in independent runs (not one diary day) |
| 2 | **Cross-scenario repeat** — seen in ≥2 usage domains (e.g. chat-thread + shared-todo), or invariant tests + usage |
| 3 | **Not tied to one usage pattern** — not chat-only ergonomics unless core behavior is the same |
| 4 | **Not tied to one observer interpretation** — still true if UI/agent changes how it reads events |
| 5 | **Not a UX expectation** — “feels like loss” is not enough; mechanism must be in `core/` |
| 6 | **Not an app-layer convention** — whole-map rewrite is app choice; LWW on a key is runtime |
| 7 | **Not a temporary implementation artifact** — must survive app-layer swap |
| 8 | **Implementation-independent** — still true if domain model, UI, or event bridge changes |

If any criterion fails → record in **`PHASE_1_5_USAGE_DIARY.md`** or **Runtime observations** (below). **Do not promote to law.**

### What is not a law

| Often repeated | Usually is |
|----------------|------------|
| Overwrite surprise, “message loss feeling” | Cognition invariant (expectation mismatch) |
| Send-gap, continuity confusion | Cognition metric on top of LAW-001 |
| Replay ambiguity, version-as-progress | Cognition invariant (metric confusion) |
| Observer “broken,” wrong `nodeId` on derived events | App bridge + LAW-005 visibility bounds |

**Rule:** Long-running stability of an observation ≠ permanent runtime structure. Stability only satisfies criterion 1, not the full bar.

### Admission freeze (Phase 1.6)

- **Admitted laws:** LAW-001–LAW-005 (frozen pending structural failure)
- **Withheld:** observations that only restate cognition on top of 001–005
- **Next law:** requires explicit admission review against the table above — default answer is **no**
- **Last pressure test:** 2026-05-21 governance pass — all five laws retained; OBS-001 remains withheld (see `docs/governance/GOVERNANCE_PASS_2026-05-21.md`)

---

## Admitted laws

### LAW-001 — Shallow LWW Convergence on Top-Level Keys

**Admission:** runtime mechanism; implementation-independent.

When conflicting mutations target the same top-level `data` key, replicas **converge to one value** via shallow merge + OCC. Competing values are discarded with **no conflict event**.

| Evidence axis | Source |
|---------------|--------|
| replay / lag / recovery | `SEMANTICS.md` §2; full-sync replaces snapshot |
| multi-replica | `002-stale-overwrite`; chat-thread V3, LR2/LR6 |
| observer | Final map only — not lost branch |

**Runtime implication:** guarantees eventual equality of replicated top-level state; **does not** guarantee intent preservation, append order, or field-level merge.

**App-layer:** partition keys, op ids, richer merge — **outside** runtime boundary unless redesign.

---

### LAW-002 — Version Is an OCC Counter, Not Domain Progress

**Admission:** runtime field semantics; implementation-independent.

`GlobalState.version` increments per successful `applyDiff` on local and inbound paths. Noop or duplicate **local** `applyLocal` may still advance version.

| Evidence axis | Source |
|---------------|--------|
| replay | `001-noop-replay`, `005-version-inflation` |
| long-running | LR5: +16 version, message count unchanged |

**Runtime implication:** version is sync cursor / sequence — **not** message count, edit depth, or causality log.

**Cognition tail (not separate law):** using version as progress bar → see failure family **Metric confusion**.

---

### LAW-003 — Deterministic Final State, Underdetermined Transition History

**Admission:** replay + event surface; implementation-independent.

Same ordered application of accepted diffs yields the same final state. `state:update` does **not** tag local vs inbound vs full-sync; transition history is **not** recoverable from version or snapshot alone.

| Evidence axis | Source |
|---------------|--------|
| replay | `003-replay-ambiguity` |
| inbound | Duplicate suppression at receiver (`npm test`) vs local duplicate not deduped |

**Runtime implication:** replay-safe **state** reproducibility — **not** narrative reproducibility.

**Cognition tail:** “did my command run twice?” → **Metric confusion** family.

---

### LAW-004 — Full-Sync Catch-Up Replaces State, Not History

**Admission:** gap recovery path; implementation-independent.

On version gap, lagging replica applies peer **full snapshot**. Converged `data` matches; lagging unmerged work on touched keys is **not** preserved or reported by runtime API.

| Evidence axis | Source |
|---------------|--------|
| lag | `006-lag-oscillation`; chat-thread V4, LR4 |
| recovery | `applyFullSync` / `resetState` semantics |

**Runtime implication:** guarantees authoritative catch-up — **not** draft continuity or auditable merge log.

**Cognition tail:** “what was lost?” → **Expectation mismatch** + **Visibility bounded**.

---

### LAW-005 — Observer and Event Visibility Are State- and Replica-Bounded

**Admission:** per-node `EventBus` + read path; implementation-independent.

Read-only replicas see `getState()` and local `state:update`. `sync:complete`, peer `error:transition`, and writer attribution on **app-derived** events are **not** guaranteed on every replica.

| Evidence axis | Source |
|---------------|--------|
| lag / observer | `004-observer-recovery`; LR4 observer `sync:complete=0` |
| multi-replica | Derived events use observer `nodeId` (diary O-16, O-35) |

**Runtime implication:** observers verify **convergence** well; **operational telemetry** requires app-layer enrichment.

**Cognition tail:** “observer broken” → **Visibility bounded** family.

---

## Runtime observations (admission withheld)

These repeat across sessions but **fail criterion 5–8** (cognition metric or corollary of admitted laws). **Do not cite as independent runtime laws.** Do not add to `SPEC.md` guarantees.

### OBS-001 — Logical-Send Count Diverges From Converged Store (cognition metric)

**Why withheld:** depends on app counting `applyLocal` successes and whole-map write pattern; corollary of LAW-001, not a separate `core/` mechanism.

**Stable observation:** after stale/concurrent loss, logical-send gap is **monotonic** (0→22) while checksums match (`007-semantic-divergence`, long-run LR2–LR6).

**Record in:** diary O-49; `SEMANTIC_FAILURE_MODES.md` family **Expectation mismatch**; `GUARANTEE_MATRIX.md` NOT GUARANTEED: logical-send reconciliation.

**Promotion blocked unless:** structural counting behavior exists in `core/` independent of app merge style.

---

## Law ↔ cognition family map

| Admitted law | Primary cognition family (see `SEMANTIC_FAILURE_MODES.md`) |
|--------------|--------------------------------------------------------------|
| LAW-001 | Expectation mismatch |
| LAW-002, LAW-003 | Metric confusion |
| LAW-004, LAW-005 | Visibility bounded |
| OBS-001 | Expectation mismatch (metric symptom only) |

---

## Related documents

| Document | Role |
|----------|------|
| `SEMANTIC_FAILURE_MODES.md` | Three cognition families + protocol contrast (not a growing taxonomy) |
| `GUARANTEE_MATRIX.md` | Guaranteed / not guaranteed / partial |
| `examples/law-probes/` | Microscopy reproductions |
| `../SEMANTICS.md` | Normative contract (authority) |
| `PHASE_1_5_USAGE_DIARY.md` | Observations; default sink for non-admitted patterns |
