# Semantic Failure Modes

Phase 1.6 — **compressed** classification. Purpose: separate protocol violations from human expectation errors — **not** to name every friction.

**Status:** descriptive only (non-normative). See `RUNTIME_LAWS.md` for admission discipline.

## Central finding

> A runtime can be **protocol-correct** while **semantically misleading.**

`npm test` and usage validations: **0 convergence failures**. Developer confusion still grows (send-gap, version noise, silent overwrite). That is **Class B**, not broken sync.

---

## Classification key

| Class | Label | Recognize by |
|-------|-------|--------------|
| **A** | Protocol / runtime failure | Invariant fail; checksum mismatch; illegal apply succeeded |
| **B** | Cognition / expectation failure | Invariants pass; replicas agree; human model wrong |

**Rule:** confusion ≠ incorrectness. Default to **B** when converged.

**Do not add new named modes** without admission review (`RUNTIME_LAWS.md`). Extend diary instead.

---

## Cognition families (Class B)

Three stable families subsume prior per-phenomenon labels. Triggers vary; **runtime reality is the same**: deterministic convergence under Phase 1 semantics.

### Family 1 — Expectation mismatch

**Human expects:** preserved intents, append continuity, “every send became a stored fact,” read-modify-write on latest snapshot.

**Runtime delivers:** LAW-001 shallow LWW; silent discard on shared top-level keys; no conflict event.

| Common triggers | Diary / probe hints |
|-----------------|---------------------|
| Stale read + concurrent whole-map write | LR2, LR6, `002-stale-overwrite` |
| Concurrent tabs / agents on `messages` / `todos` | chat-thread V3, shared-todo V4 |
| Counting `applyLocal` true as “messages sent” | OBS-001, `007-semantic-divergence`, send-gap 0→22 |

**Symptoms (do not treat as separate laws):** overwrite surprise, message-loss feeling, continuity confusion, send-gap.

**Runtime check:** checksums match; store cardinality < logical sends possible.

---

### Family 2 — Metric confusion

**Human expects:** `version` or event count tracks “what happened” in domain terms.

**Runtime delivers:** LAW-002 version as OCC counter; LAW-003 state:update without transition kind; local replay not deduped.

| Common triggers | Diary / probe hints |
|-----------------|---------------------|
| Duplicate `applyLocal` / tool retry | V5, LR5, `001-noop-replay` |
| Version trail ambiguity | `003-replay-ambiguity` |
| Lag cycles bumping version | `006-lag-oscillation`, LR4 |

**Symptoms:** replay ambiguity, version inflation, “high version = busy thread,” “did it run once or twice?”

**Runtime check:** version monotonic; `data` may be unchanged; inbound duplicate may suppress (`npm test`).

---

### Family 3 — Visibility bounded

**Human expects:** observer sees full sync lifecycle, writer identity on events, recoverable history after lag.

**Runtime delivers:** LAW-004 snapshot catch-up without loss report; LAW-005 per-node bus and state-bounded reads.

| Common triggers | Diary / probe hints |
|-----------------|---------------------|
| UI on observer only | LR3, LR4 |
| Derived events without writer id | O-16, O-35 |
| Expect `sync:complete` everywhere | `004-observer-recovery`, O-18, O-39 |

**Symptoms:** observer ambiguity, recovery opacity, “sync finished?” on wrong replica.

**Runtime check:** observer `getState()` equals writers; `sync:complete` may be 0 on observer.

---

## Family ↔ admitted law

| Family | Laws | Withheld observation |
|--------|------|----------------------|
| Expectation mismatch | LAW-001 | OBS-001 (send-gap metric) |
| Metric confusion | LAW-002, LAW-003 | — |
| Visibility bounded | LAW-004, LAW-005 | — |

---

## Protocol failure (Class A — contrast only)

| Violation | Example |
|-----------|---------|
| Invariant divergence | Checksum mismatch after sync (not observed in validation) |
| Illegal transition applied | — |
| Illegal transition rejected | `recovering` disallowed key (ai-workspace V4b) — **valid** reject |
| Invalid full-sync | Store unchanged (invariant test) |
| Gap without recovery path | Would stall — runtime requests full-sync (positive path) |

---

## Observation discipline

| If you see… | Do this |
|-------------|---------|
| New repeating friction | Diary entry first |
| Cross-session + cross-scenario + implementation-independent | Propose law admission review |
| Repeats but “feels wrong” only | Keep in family 1–3; **no new law** |
| Stable for weeks | Still **not** auto-promote to guarantee |

---

## Related

- `RUNTIME_LAWS.md` — admission criteria; LAW-001–005; OBS-001 withheld
- `GUARANTEE_MATRIX.md` — explicit not-guaranteed surfaces
- `examples/law-probes/` — reproduction microscopy
