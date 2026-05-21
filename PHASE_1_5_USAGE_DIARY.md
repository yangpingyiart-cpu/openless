# Phase 1.5 — Usage Diary

Runtime friction observed during real usage validation.  
Sources: `examples/shared-todo/`, `examples/ai-workspace/`, `examples/chat-thread/`, `npm test` (invariants held throughout).

**Status:** record only — no fixes applied in Phase 1.5.

---

## 1. Observation Log

| ID | Date | Scenario | Trigger behavior | Runtime behavior | Blocker? | Repeated? |
|----|------|----------|------------------|------------------|----------|-----------|
| O-01 | 2026-05-17 | shared-todo | `applyLocal` after rule/validation failure | Returns `false`; reason only via separate `error:transition` subscription | No | Yes (ai-workspace) |
| O-02 | 2026-05-17 | shared-todo | Every local/inbound write | `state:update` fires for local apply, inbound apply, and full-sync (`applyFullSync`) | No | Yes |
| O-03 | 2026-05-17 | shared-todo | UI/agent wants “who wrote this?” | No actor, causation id, or local-vs-remote flag on event payload | No | Yes |
| O-04 | 2026-05-17 | shared-todo | Add/toggle todo | Must rebuild full `{ todos, nextId }` blob per `applyLocal` | No | Yes |
| O-05 | 2026-05-17 | shared-todo | Read replica state | `node.store.getState()` + app-side `readBoard()` parsing | No | Yes |
| O-06 | 2026-05-17 | shared-todo | Simulate peer lag | `bobNode.store.resetState(...)` — not exposed on `OpenLessNode` | No | Yes |
| O-07 | 2026-05-17 | shared-todo | Build `StateDiff` | Caller must set `timestamp` every time; runtime does not default it | No | Yes |
| O-08 | 2026-05-17 | shared-todo | Retry same logical “add todo” | Second `applyLocal` advances version; no op-id dedup | No | Yes |
| O-09 | 2026-05-17 | shared-todo | Subscribe UI handler | `EventBus.unsubscribe` needs same function reference as `subscribe` | No | Once |
| O-10 | 2026-05-17 | shared-todo | Choose event source | `diff:received` vs `state:update` — no guidance; apps pick `state:update` | No | Once |
| O-11 | 2026-05-17 | shared-todo | Gap then catch-up | `sync:request` → full-sync → converged; no sync internals needed | No | Once (positive) |
| O-12 | 2026-05-17 | shared-todo | Malformed peer data (hypothetical) | `readBoard()` coerces; runtime does not validate `data` shape | No | Yes |
| O-13 | 2026-05-17 | shared-todo | `index.ts` imports | `DeltaSyncer`, `TransitionEngine` exported — bypass risk for app code | No | Once |
| O-14 | 2026-05-17 | ai-workspace V2 | Planner + coder write separate top-level keys | Converged; shallow merge sufficient when domains do not overlap | No | Once (positive) |
| O-15 | 2026-05-17 | ai-workspace V3 | UI observer derives app events from `state:update` | Works; 5 derived events, snapshot matches at v9 | No | Once (positive) |
| O-16 | 2026-05-17 | ai-workspace V3 | Derived `workspace:*` events | `nodeId` on event is **observer** (`ui`), not writer (`planner`/`coder`) | No | Once |
| O-17 | 2026-05-17 | ai-workspace V4 | Coder lag via `resetState(v0)`; planner writes context | Coder gets `sync:complete`; all nodes v10 converged | No | Once (positive) |
| O-18 | 2026-05-17 | ai-workspace V4 | UI watches recovery | UI sees `state:update`; does **not** see `sync:complete` (only on lagged coder) | No | Once |
| O-19 | 2026-05-17 | ai-workspace V4b | Coder `status: recovering`; `applyLocal` on `files` | `applyLocal` → `false`; illegal write rejected | No | Once |
| O-20 | 2026-05-17 | ai-workspace V4b | Legal recovery progress | Only `recovery` / `recovery.*` keys accepted; `recovery.lastMessage` works | No | Once (positive) |
| O-21 | 2026-05-17 | ai-workspace V4b | UI watches coder rule violation | `error:transition` on coder bus; **not** observed on UI bus | No | Once |
| O-22 | 2026-05-17 | ai-workspace V5 | Stale read; planner and coder both `applyLocal` on `context` | Last writer wins: `"coder-stale-overwrite"`; silent, no merge conflict signal | No | Once |
| O-23 | 2026-05-17 | ai-workspace V6 | Same `applyLocal` payload twice | v16→v17; phase set to `review` again; version increments | No | Yes (with O-08) |
| O-24 | 2026-05-17 | ai-workspace V6 | Tool retry semantics (conceptual) | App would need op ids; runtime provides version only | No | Yes (with O-08) |
| O-25 | 2026-05-17 | ai-workspace | Full-sync after lag | Entire `data` replaced; local uncommitted draft on lagging node would be lost | No | Yes (shared-todo) |
| O-26 | 2026-05-17 | ai-workspace | Role split planner/coder | Enforced in app clients only; runtime does not enforce writer domains | No | Once |
| O-27 | 2026-05-17 | both | `npm test` after examples | 7/7 invariant tests pass; no convergence failure | No | Once (positive) |
| O-28 | 2026-05-17 | shared-todo V3 | Observer derives `todo:*` events | Event `nodeId` is `observer`, not `userA`/`userB` | No | Yes (O-16) |
| O-29 | 2026-05-17 | shared-todo V4 | Stale read; both edit `todos["1"].title` | Last write wins: `"Title from userB (stale)"` | No | Yes (O-22) |
| O-30 | 2026-05-17 | shared-todo V5 | userB lag; userA adds todo | userB `sync:complete`; observer sync:complete=0; converged | No | Yes (O-18) |
| O-31 | 2026-05-17 | shared-todo V6 | Same `todoDiff({ metadata })` twice | v increments twice; duplicate returns true | No | Yes (O-08, O-23) |
| O-32 | 2026-05-17 | shared-todo V2 | userB edit/assign; userA complete different ids | No conflict; checksum match | No | Once (positive) |
| O-33 | 2026-05-17 | shared-todo V1–V6 | Top-level `todos`/`users`/`presence`/`metadata` | Shallow merge OK when keys partitioned by operation | No | Once (positive) |
| O-34 | 2026-05-17 | chat-thread V1 | windowA/B sequential append + presence | Converged v5; 2 messages; checksum match | No | Once (positive) |
| O-35 | 2026-05-17 | chat-thread V2 | Observer `message:appended` bridge | 2 derived events; snapshot=2; `nodeId=observer` not writer | No | Yes (O-16, O-28) |
| O-36 | 2026-05-17 | chat-thread V3 | Stale read; both append to `messages` | LWW: `"Concurrent B (stale)"` wins id=3; A's concurrent msg lost | No | Yes (O-22, O-29) |
| O-37 | 2026-05-17 | chat-thread V3 | Chat append model | Whole `messages` map per append; `metadata.nextMessageId` races with stale read | No | Yes (O-04) |
| O-38 | 2026-05-17 | chat-thread V4 | windowB `resetState(v0)`; windowA append | Full-sync; v8; 4 messages converged; windowB `sync:complete=1` | No | Yes (O-17, O-30) |
| O-39 | 2026-05-17 | chat-thread V4 | Observer during recovery | `sync:complete=0`; 1 `state:update`-derived event only | No | Yes (O-18) |
| O-40 | 2026-05-17 | chat-thread V5 | Duplicate metadata `applyLocal` twice | v8→v10; second apply returns true | No | Yes (O-08, O-23, O-31) |
| O-41 | 2026-05-17 | chat-thread | Lag simulation | `store.resetState` — not on `OpenLessNode` | No | Yes (O-06) |
| O-42 | 2026-05-17 | chat-thread V1–V5 | `presence` top-level key | Typing updates separate from `messages`; no cross-key conflict in V1 | No | Once (positive) |
| O-43 | 2026-05-17 | chat-thread LR1 | 40 alternating appends | 40 msgs @ v50; gap=0; checksum YES | No | Once (positive) |
| O-44 | 2026-05-17 | chat-thread LR2 | 12× stale concurrent pairs | 22 msgs lost; gap 0→12; store=52 vs 64 logical sends | No | Yes (O-36) |
| O-45 | 2026-05-17 | chat-thread LR3 | 2 observer-only nodes, 20 writes | Both observers derive events; `nodeId=observer*`; no writes | No | Yes (O-35) |
| O-46 | 2026-05-17 | chat-thread LR4 | 6× lag/recovery loops | All converge; observer `sync:complete=0` every loop | No | Yes (O-39) |
| O-47 | 2026-05-17 | chat-thread LR5 | 8× duplicate metadata replay | +16 version bumps; message count unchanged | No | Yes (O-40) |
| O-48 | 2026-05-17 | chat-thread LR6 | 10× concurrent burst loops | +10 more stale losses; gap 12→22 | No | Yes (O-44) |
| O-49 | 2026-05-17 | chat-thread long-run | Send-gap trajectory | gap grows monotonically after LR2; never shrinks | No | **Accumulating** |
| O-50 | 2026-05-17 | chat-thread long-run | Version vs messages | v146 for 98 messages — version feels like “activity” not “messages” | No | **Accumulating** |
| O-51 | 2026-05-17 | chat-thread long-run | 11 convergence checks | 0 failures — correctness stable while confusion grows | No | Once (positive) |
| O-52 | 2026-05-17 | chat-thread long-run | `lag_reset_store` hits | 12 diary hits; API awkwardness does not compound (learn once) | No | **One-shot** |
| O-53 | 2026-05-18 | Phase 1.6 stabilization | `npm test` + law-probes + chat-thread-long re-run | 7/7 tests; 7/7 probes protocol-valid; long-run totals unchanged (120 sends, 98 store, gap 22, v146, 0 convergence failures) | No | Yes (O-51) |
| O-54 | 2026-05-18 | docs authority check | SPEC/SEMANTICS vs `docs/runtime/*` vs diary | No diary IDs in normative docs; README “Phase 2 consolidation” label tightened to “runtime contract” | No | Once |
| O-55 | 2026-05-18 | Phase 1.6 re-validation #2 | Same command triad as O-53 | Identical long-run fingerprint (120/98/gap22/v146/0 failures); cognition classes unchanged | No | Yes (O-53) |
| O-56 | 2026-05-18 | law admission discipline | LAW-006 → OBS-001; failure modes → 3 families | Prevents law ossification; runtime laws frozen at 5 | No | Once |
| O-57 | 2026-05-21 | quiet window #1 | Full triad: test + 3 examples + law-probes + chat-thread-long | 7/7 tests; 7/7 probes protocol-valid; long-run fingerprint unchanged (120/98/gap22/v146/0 failures) | No | Yes (O-53, O-55) |
| O-58 | 2026-05-21 | shared-todo re-run | V1–V6 unchanged: stale LWW, observer nodeId, sync:complete on lagged node only | All checksum YES; v13 terminal | No | Yes (O-29–O-31) |
| O-59 | 2026-05-21 | ai-workspace re-run | V1–V6 unchanged: context LWW, duplicate v+2, UI no sync:complete | All convergence YES; v17 terminal | No | Yes (O-22–O-23) |
| O-60 | 2026-05-21 | chat-thread re-run | V1–V5 unchanged: 1 concurrent msg lost, observer sync:complete=0 | checksum YES; v10 terminal | No | Yes (O-36, O-39) |
| O-61 | 2026-05-21 | docs authority re-audit | Grep SPEC/SEMANTICS/docs for inflation phrases | No `preserves intent` / `never loses` / `eventual user`; G-1–G-8 unchanged | No | Yes (O-54) |
| O-62 | 2026-05-21 | quiet window cycle #2 | test + 3 examples + long-run + law-probes | Fingerprint unchanged (120/98/gap22/v146/0 failures); 7/7 tests; 7/7 probes | No | Yes (O-57) |
| O-63 | 2026-05-21 | `observe:timing-variance` | 13 TV scenarios across 3 domains | **13/13 runtime converged**; cognition classes unchanged | No | Once |
| O-64 | 2026-05-21 | timing variance | Extended stale, delayed attach, overwrite burst, partial observer, silence+replay | Overwrite LWW 1-loss/pair stable; delayed attach → partial derived history; recovery invisibility on observer | No | Yes (O-18, O-36) |
| O-65 | 2026-05-21 | authority tighten | `docs/semantic-model.md` header | "Convergence guarantees" → "current validation indicates"; SPEC authority pointer added | No | Once |
| O-66 | 2026-05-21 | silence window ×5 | `observe:silence-window` baseline cycles | 5/5 fingerprint `120/98/gap22/v146/0`; 7/7 tests each; law-probes OK | No | Yes (O-62) |
| O-67 | 2026-05-21 | extended SV ×2 | `observe:silence-validation` (silenceTicks=80, stale=18, obs=35) | 2/2 fingerprint `149/121/gap28/v167/0`; 0 failures; 28/28 stale loss rate | No | Once |
| O-68 | 2026-05-21 | SV scaling law (diary) | Extended vs baseline params | gap scales with stale volume (22→28); **1 loss/pair invariant**; deterministic not drifting | No | Once |
| O-69 | 2026-05-21 | authority tighten #2 | `semantic-model.md` observer; `SEMANTICS.md` §5.2 | "Guaranteed" → "current validation indicates" / "validated surfaces" | No | Once |
| O-70 | 2026-05-21 | governance pass | `npm run governance:pass` | Full pass complete; report `docs/governance/GOVERNANCE_PASS_2026-05-21.md` | No | Once |
| O-71 | 2026-05-21 | runtime fatigue ×3 | `observe:runtime-fatigue` | 0 failures; lossRate=1.00 each round; Δgap=15/round stable | No | Once |
| O-72 | 2026-05-21 | horizon silence ×2 | `observe:horizon-silence` | `110/86/gap24/v144/0` identical both runs | No | Once |
| O-73 | 2026-05-21 | law pressure test | LAW-001–005 criteria | All KEEP; OBS-001 WITHHELD; no demotions | No | Once |
| O-74 | 2026-05-21 | cognition drift doc | Governance §7 | Five phenomena documented structural; no runtime fixes | No | Once |
| O-75 | 2026-05-21 | minimality watch | Ergonomics / observer-fix pressure | Recorded; NOT implemented (causality, narration, etc.) | No | Once |

**Blocker definition used here:** prevents convergence, breaks OCC invariants, or makes `OpenLessNode`-only integration impossible. None of O-01–O-75 are blockers under this definition.

---

## Phase 1.6 Stabilization Window (2026-05-18)

**Scope:** observation + documentation verification only — no `core/*` changes, no new infra.

### Documentation authority graph (verified)

| Layer | Files | Normative? |
|-------|-------|------------|
| Contract | `SPEC.md`, `SEMANTICS.md`, `NON_GOALS.md` | Yes |
| Positioning | `POSITIONING.md` | Yes (fit / non-fit) |
| Runtime laws | `docs/runtime/RUNTIME_LAWS.md`, `GUARANTEE_MATRIX.md`, `SEMANTIC_FAILURE_MODES.md` | Descriptive (Phase 1.6) |
| Planning | `docs/phase2-backlog.md`, `ERGONOMICS_BACKLOG.md` | No — not commitments |
| Observation | This diary, `PHASE_1_5_*_VALIDATION.md` | No — must not leak into SPEC |

**Findings:** No accidental guarantees found in SPEC/SEMANTICS beyond validated G-1–G-8. No O-xx / LR-xx IDs in normative contract. Roadmap table in README remains separate from contract section. **Clarification only:** README contract heading renamed; `docs/runtime-positioning.md` points to root `POSITIONING.md` as authority.

### Re-validation commands (2026-05-18)

```bash
npm test                    # 7/7 pass
npm run law-probes          # 001–007 protocol-valid
npm run example:chat-thread-long   # gap 0→22, failures 0
```

**Outcome:** Patterns stable across sessions — send-gap pattern recorded as OBS-001 (admission withheld; see `RUNTIME_LAWS.md`).

**Session #2 (same day):** Re-run triad — fingerprint unchanged. `SEMANTIC_FAILURE_MODES.md` gained explicit A/B classification key; `docs/non-goals.md` authority pointer added.

**Session #3 — law admission discipline:** LAW-006 demoted to OBS-001; laws frozen at 001–005. Failure modes compressed to 3 cognition families. No LAW-007.

### Stable cognition failures (cross-session — families, not new laws)

| Family | Frictions | Admitted law |
|--------|-----------|--------------|
| Expectation mismatch | `overwrite_lww`, `full_map_rewrite`, `sent_vs_store_gap` | 001 (+ OBS-001 metric) |
| Metric confusion | version/message drift, noop replay | 002, 003 |
| Visibility bounded | `recovery_visibility`, observer attribution | 004, 005 |
| ONE_SHOT (diary only) | `lag_reset_store`, event-bridge setup | — |

**Admission rule:** repeating friction → diary or cognition family first; law only if `RUNTIME_LAWS.md` criteria all pass.

---

## Quiet Stabilization Window (2026-05-21)

**Mode:** runtime naturalist — observe only. No `core/*` changes. No new domains. No law admission.

### Commands run

```bash
npm test
npm run example:shared-todo
npm run example:ai-workspace
npm run example:chat-thread
npm run example:chat-thread-long
npm run law-probes
```

### Cross-session fingerprint (chat-thread long-run)

| Metric | 2026-05-17 | 2026-05-18 | 2026-05-21 |
|--------|------------|------------|------------|
| logical sends | 120 | 120 | 120 |
| store messages | 98 | 98 | 98 |
| send-gap | 22 | 22 | 22 |
| terminal version | 146 | 146 | 146 |
| convergence failures | 0 | 0 | 0 |
| law probes protocol-valid | — | 7/7 | 7/7 |

**Interpretation:** Semantic stability persists under silence. Cognition pressure classes unchanged (REPEATING / ACCUMULATING / ONE_SHOT). No new structural failure.

### Validation diary entries (structured)

#### VD-2026-05-21-A — shared-todo stale overwrite

**OBSERVED:** Concurrent edit on `todos["1"].title` → `"Title from userB (stale)"`; silent LWW.

**RUNTIME STATUS:** converged correctly @ v10; replay valid; no protocol divergence.

**OBSERVER EFFECT:** Derived `todo:*` events carry `nodeId=observer`; human may attribute edit to observer replica, not userB.

#### VD-2026-05-21-B — ai-workspace recovery visibility

**OBSERVED:** Coder lag + full-sync; UI sees `state:update` only; `sync:complete` on coder bus only.

**RUNTIME STATUS:** converged correctly @ v10 post-lag; recovering rule rejects illegal `files` write.

**OBSERVER EFFECT:** Recovery invisibility on observer — final state equality without reconstruction narrative.

#### VD-2026-05-21-C — chat-thread long-run send-gap

**OBSERVED:** gap 0→22 monotonic; 22 stale losses; v146 vs 98 messages.

**RUNTIME STATUS:** 11/11 convergence checks pass; checksums match all replicas.

**OBSERVER EFFECT:** Protocol-correct replica hides lost append intents (OBS-001 metric; law admission withheld).

#### VD-2026-05-21-D — law probes observer-invariance check

**OBSERVED:** Probes 001–007 outcomes identical to prior sessions; 002 reports 22/22 stale pair loss rate.

**RUNTIME STATUS:** all probes report protocol-valid convergence.

**OBSERVER EFFECT:** 003/005 — version trail cannot distinguish first apply vs retry; version inflation without semantic delta.

### Authority discipline audit (2026-05-21)

| Check | Result |
|-------|--------|
| `preserves intent` / `never loses` / `eventual user consistency` in repo | **Absent** |
| Diary IDs (O-xx, LR-xx, VD-xx) in `SPEC.md` / `SEMANTICS.md` | **Absent** |
| `docs/semantic-model.md` "Convergence guarantees" | Lists guaranteed + not-guaranteed pairs — descriptive, not new contract |
| Law admission freeze | **Holding** — LAW-001–005 only; OBS-001 diary metric |

**Leakage risk (watch only, no edit today):** `docs/semantic-model.md` heading "Convergence guarantees" could be misread as normative if cited without `SPEC.md` pointer. Not escalated — existing authority graph sufficient.

### Law admission freeze status

| Candidate | Cross-session | Cross-domain | Impl-independent | Observer-invariant | Admit? |
|-----------|---------------|--------------|------------------|-------------------|--------|
| send-gap (OBS-001) | Yes | Yes (chat primary) | Yes | **No** — depends on counting logical sends | **Withheld** |
| overwrite LWW | Yes | Yes | Yes | Partial — human expects merge | **Already LAW-001** |
| recovery visibility | Yes | Yes | Yes | **No** — observer-bound | **Already LAW-005** |

**No new laws proposed.**

### Cycle #2 — timing variance (2026-05-21)

**Script:** `npm run observe:timing-variance` (examples only; no `core/*` changes)

| Domain | Scenarios | Runtime | Observer (not protocol) |
|--------|-----------|---------|-------------------------|
| chat-thread | TV1–TV5 | 5/5 converged | extended stale still 1-loss/pair; delayed attach derived=0; silence replay +3v |
| shared-todo | TV2–TV5 | 4/4 converged | delayed attach partial history; 5× overwrite → `B-stale-4`; replay +2v |
| ai-workspace | TV2–TV5 | 4/4 converged | delayed attach ui events=1; 5× context → `coder-stale-4`; silence replay +2v |

**Conclusion:** Cognition drift patterns are **timing-invariant** under in-process mesh variance. Confusion remains observer-bound; **not** classified as protocol instability.

**Law freeze (reaffirmed):** send-gap, replay ambiguity, overwrite disappearance, recovery invisibility — validation only.

---

## Autonomous Silence-Validation Window (2026-05-21) — COMPLETE

**Orchestrator:** `npm run observe:silence-window` (5 baseline cycles + 2 extended SV + timing-variance)

### Runtime semantic identity (stable)

| Profile | Runs | Fingerprint | Convergence failures | Stale loss rate |
|---------|------|-------------|----------------------|-----------------|
| Baseline long-run | 5 | `120/98/gap22/v146/0` | 0 | 22/22 pairs |
| Extended SV | 2 | `149/121/gap28/v167/0` | 0 | 28/28 pairs |

**New stability signal:** Extended parameters scale **deterministically** (not stochastically). Send-gap grows with stale-loop count (structural OBS-001), but **1 logical loss per stale pair** holds across baseline and extended profiles. No protocol divergence under prolonged silence or timing variance.

### Observer continuity (unchanged — validation only)

| Phenomenon | Under extended silence | Protocol? |
|------------|------------------------|-----------|
| send-gap growth | 0→28 monotonic | No — metric on logical sends |
| recovery invisibility | 8/8 lag loops observer sync miss | No — event locality |
| delayed attach | derived=0 after 12 pre-writes | No — chronology perception |
| replay after silence | +6v, 0 semantic delta | No — version inflation |
| overwrite LWW | 28/28 pairs lose exactly 1 | No — expected LWW |

**Discipline:** Runtime converged + checksums valid throughout → **do not** classify as protocol instability.

### Law admission freeze (held)

No promotion. OBS-001 remains observer-dependent (send counting). Structural friction **not** runtime-destabilizing.

### Authority audit (window close)

| File | Adjustment |
|------|------------|
| `docs/semantic-model.md` | Observer section: "Guaranteed" → "current validation indicates" |
| `SEMANTICS.md` §5.2 | Heading clarifies validated surfaces ≠ continuity |
| Grep | No `preserves intent` / `never loses` / `eventual user` |

**Mission outcome:** Semantic stability under silence — **confirmed**. Capability growth — **not pursued**.

---

## Long-Horizon Runtime Governance Pass (2026-05-21) — COMPLETE

**Report:** [docs/governance/GOVERNANCE_PASS_2026-05-21.md](docs/governance/GOVERNANCE_PASS_2026-05-21.md)  
**Orchestrator:** `npm run governance:pass`

### Outcome summary

| Objective | Result |
|-----------|--------|
| Runtime fatigue | 3 rounds, 0 convergence failures, loss rate 1.00/pair invariant |
| Silence horizon | `110/86/gap24/v144/0` ×2 identical |
| Governance audit | Clean; no inflation phrases; authority graph intact |
| Law admission | 5 KEEP, OBS-001 WITHHELD, no new laws |
| Ontology expansion | **None** |

**Stability signal:** Fatigue and horizon extend semantic pressure without protocol erosion — confusion compounds as **metrics**, not **divergence**.

**Governance integrity:** **PASS**. No redesign pressure indicated.

---

## Shared Todo Validation (2026-05-17)

**Script:** `examples/shared-todo/run.ts` (`npm run example:shared-todo`)  
**Stack:** `todo-model` / `todo-client` / `todo-events` → `OpenLessNode` only

### Run evidence

| Step | Result |
|------|--------|
| V1 | 3 nodes; userA creates todos 1–2; checksum match |
| V2 | userB edits t1; userA completes t2; assign; converged |
| V3 | Observer: app events ≥2 `todo:added`; snapshot matches; no writes |
| V4 | Concurrent t1 title → `"Title from userB (stale)"` |
| V5 | userB `resetState(v0)` → userA add → full-sync; converged |
| V6 | Duplicate metadata diff → version +2 |

### Friction log (do not fix now)

| Observation | Status | Evidence |
|-------------|--------|----------|
| **overwrite cognition** | **Confirmed** | V4: stale B overwrites A on same todo id |
| **ordering cognition** | **Confirmed** | V6: version monotonic; no causal op ordering beyond OCC |
| **observer semantics** | **Confirmed** | V3: works; derived events tagged `observer` not writer |
| **replay readability** | **Confirmed** | V5: lagged node gets `sync:complete`; observer sees `state:update` only |
| **semantic collapse** | **Confirmed** | `state:update` drives all app derivations; local/inbound/full-sync indistinguishable without diff parse |
| **applyLocal ergonomics** | **Confirmed** | Full `todos` map per edit; boolean return; manual timestamp |
| **recovery UX** | **Confirmed** | Gap recovery converges; lag via `resetState` not Node API |
| **idempotency** | **Confirmed** | Duplicate payload still advances version |
| **multi-user不同 todo** | **Not observed** as problem | V2: separate todo ids — no overwrite |
| **observer blocked** | **Not observed** | V3: read-only path sufficient |
| **convergence failure** | **Not observed** | All steps checksum YES |
| **overwrite severity** | **Worse than expected** | Silent LWW on shared key; no conflict event (only if expecting merge) |

### Verdict (shared-todo)

- **Runtime redesign needed?** **No**
- **Backlog:** Phase 2 ergonomics / semantic pressure (typed reads, apply result reason, actor on events, optional op id)

---

## Chat Thread Validation (2026-05-17)

**Script:** `examples/chat-thread/run.ts` (`npm run example:chat-thread`)  
**Stack:** `thread-model` / `chat-client` / `chat-events` → `OpenLessNode` only

### Run evidence

| Step | Result |
|------|--------|
| V1 | 3 nodes; sequential messages 1–2; presence update; checksum YES @ v5 |
| V2 | Observer: 2× `message:appended`, snapshot=2; no writes |
| V3 | Concurrent stale append → id=3 is B only; A's `"Concurrent A"` lost; converged @ v7 |
| V4 | windowB `resetState(v0)` → windowA append → full-sync; 4 msgs @ v8 |
| V5 | Duplicate metadata diff → v8→v10 |

### Friction log (do not fix now)

| Observation | Status | Evidence |
|-------------|--------|----------|
| **overwrite cognition** | **Confirmed** | V3: whole-map LWW drops concurrent message A |
| **ordering cognition** | **Confirmed** | V5: version +2 on noop metadata replay |
| **observer semantics** | **Confirmed** | V2: derived events tagged `observer`; author in payload |
| **replay readability** | **Confirmed** | V4: lagged windowB gets `sync:complete`; observer does not |
| **semantic collapse** | **Confirmed** | Bridge on `state:update` only |
| **applyLocal ergonomics** | **Confirmed** | Full `messages` blob per append; boolean return |
| **recovery UX** | **Confirmed** | V4 converges; lag via `resetState` |
| **idempotency** | **Confirmed** | V5 duplicate metadata diff advances version |
| **chat-specific** | **Confirmed** | Append races on `messages` + `metadata.nextMessageId` — not safe for true multi-writer chat without app partition or CRDT (out of scope) |
| **presence partition** | **Not a problem** | V1: `presence` key separate from `messages` |
| **convergence failure** | **Not observed** | All steps checksum YES |

### Verdict (chat-thread)

- **Runtime redesign needed?** **No**
- **Third scenario** confirms O-22/O-16/O-18/O-08 patterns for multi-window chat semantics
- **Chat domain note:** sequential appends with fresh reads work; concurrent append to shared `messages` map is structurally lossy under shallow LWW — expected, not a runtime bug

---

## Chat Thread Long-Run Validation (2026-05-17)

**Script:** `examples/chat-thread/long-run.ts` (`npm run example:chat-thread-long`)  
**Tooling:** `validation-diagnostics.ts` (`CognitionLedger`), `simulation-harness.ts`

### Session totals (representative run)

| Metric | Value |
|--------|-------|
| Logical sends | 120 |
| Store messages | 98 |
| Send gap | 22 (growing) |
| Stale pairs / msgs lost | 22 / 22 |
| Noop replay version bumps | 16 |
| Lag loops / observer sync misses | 6 / 6 |
| Convergence failures | 0 |

### Cognition pressure classification

| Class | Frictions | Meaning |
|-------|-----------|---------|
| **REPEATING** | `overwrite_lww`, `full_map_rewrite`, `recovery_visibility`, `lag_reset_store`, `applylocal_opaque` | Re-encountered every loop; becomes “how OpenLess works” not a surprise |
| **ACCUMULATING** | `sent_vs_store_gap`, version/message divergence | Developer mental model drifts: “I sent N” ≠ “store has N”; version keeps climbing on noop |
| **ONE_SHOT** | First `resetState` discovery, boolean `applyLocal`, event-bridge setup | Awkward once; does not worsen with session length |

### Key long-run insight

**Correctness and confusion decouple.** Checksums converge across 4 nodes through 146 versions while send-gap grows 0→22. Long sessions punish chat semantics without ever failing OCC — the pressure is **cognitive**, not **protocol**.

### Verdict (long-run)

- **Runtime redesign?** **No**
- **Ergonomics pressure intensifies** with session length (gap, version noise) — backlog only

---

## 2. Friction Categories

### event semantic collapse

| Observation IDs | Summary |
|-----------------|---------|
| O-02, O-03, O-10, O-16 | `state:update` is the default app hook but bundles local write, inbound replicate, and full-sync. No built-in locality or writer attribution. |
| O-18 | Recovery signaling (`sync:complete`) is not uniformly visible on all replicas; observers may only see version bumps. |

**Repeat count:** 3 scenarios (todo, ai-workspace, chat-thread). **Structural failure:** no.

---

### applyLocal awkwardness

| Observation IDs | Summary |
|-----------------|---------|
| O-01, O-04, O-07, O-26 | Boolean result; manual `StateDiff` construction; full top-level blobs; timestamp required; domain rules live in app wrappers. |
| O-13 | Public exports allow skipping the façade. |

**Repeat count:** 3 scenarios. **Structural failure:** no.

---

### multi-writer overwrite

| Observation IDs | Summary |
|-----------------|---------|
| O-08, O-22, O-23, O-24 | Concurrent or duplicate writes: last top-level key wins; version always advances; no merge conflict event. |
| O-14 | Mitigation observed: separate top-level keys per writer role — app convention, not runtime guarantee. |

**Repeat count:** 3 scenarios (duplicate idempotency in all three). **Structural failure:** no (convergence held).

---

### recovery cognition

| Observation IDs | Summary |
|-----------------|---------|
| O-06, O-17, O-25 | Lag simulation uses `store.resetState`; full-sync is authoritative snapshot. Works but is not discoverable from `OpenLessNode` API alone. |
| O-19, O-20 | `recovering` rules work when keys are `recovery.*`; illegal domain writes fail closed. |
| O-21 | Errors are per-node bus; observers on other replicas do not see peer transition failures. |

**Repeat count:** 3 scenarios (todo, workspace, chat-thread: gap). **Structural failure:** no.

---

### observer ergonomics

| Observation IDs | Summary |
|-----------------|---------|
| O-05, O-15, O-16, O-18, O-21 | Observer pattern viable via `getState()` + derived events; must hand-roll bridge; sync/recovery events uneven across replicas; attribution wrong on derived events. |
| O-09 | Subscription lifecycle is manual. |

**Repeat count:** 3 scenarios. **Structural failure:** no.

---

### schema friction

| Observation IDs | Summary |
|-----------------|---------|
| O-04, O-12, O-25 | `data: Record<string, any>`; app parses/coerces; shallow merge; nested updates need whole-map replacement. |
| O-07 | No zod/runtime schema at boundary (`schemas/` empty). |

**Repeat count:** 3 scenarios. **Structural failure:** no.

---

## 3. Decision Rule

Enter **runtime redesign** only when **all** of the following hold:

1. **Repeated:** The same friction class appears in **≥ 2 independent usage scenarios** (e.g. shared-todo and ai-workspace), **and** shows up in **≥ 2 observation log entries** that are not mitigated by app-layer convention alone.

2. **Structural:** The friction causes at least one of:
   - invariant test failure (`npm test`);
   - end-state divergence under documented `applyLocal` / `handleInbound` usage;
   - impossible to implement the scenario using **only** `OpenLessNode` for writes (excluding deliberate test hooks like `resetState` for lag simulation).

3. **Not app-only:** A fix in the example app (client wrapper, domain split, event bridge) cannot resolve it without changing `core/*` semantics.

If (1)–(3) are not met → **record**, optionally add ergonomics in Phase 2 (schema, helpers), **do not** redesign DeltaSync / Engine / inbound pipeline.

**Current tally against rule:** 0 entries qualify for runtime redesign.

---

## 4. Current Rule

- **Do not fix** friction in Phase 1.5 validation follow-up.
- **Do log** new observations in §1 with the same columns.
- **Revisit** a category only when a **new** scenario reproduces it under the Decision Rule.
- **Prefer** app-layer adapters (`*Client`, `*EventBridge`, domain-separated top-level keys) until structural failure is proven.
- **Keep** `npm test` green after any future example; regression there overrides diary consensus.

---

## Appendix: positive observations (not friction)

| ID | Note |
|----|------|
| O-11, O-14, O-15, O-17, O-20, O-27, O-32, O-33, O-34, O-38, O-42, O-43, O-51 | `OpenLessNode` + `InMemorySyncHub` sufficient for 2–4 node convergence without sync imports. |

These are recorded so the diary is not only negative signal.

---

## Related files

| File | Role |
|------|------|
| `examples/shared-todo/README.md` | Shared-todo how-to |
| `PHASE_1.5_VALIDATION.md` | Shared-todo (legacy notes) |
| `PHASE_1_5_AI_WORKSPACE_VALIDATION.md` | AI workspace matrix |
| `PHASE_1_5_CHAT_THREAD_VALIDATION.md` | Chat thread matrix |
| `PHASE_1_5_CHAT_THREAD_LONG_VALIDATION.md` | Long-run cognition report |
| `docs/runtime/RUNTIME_LAWS.md` | Phase 1.6 extracted laws |
| `docs/runtime/GUARANTEE_MATRIX.md` | Guarantee surfaces |
| `examples/law-probes/` | Law microscopy probes |
| `examples/quiet-observation/timing-variance.ts` | Timing-variance observation (`npm run observe:timing-variance`) |
| `examples/quiet-observation/silence-validation.ts` | Extended silence profile (`npm run observe:silence-validation`) |
| `examples/quiet-observation/run-silence-window.ts` | Multi-cycle autonomous window (`npm run observe:silence-window`) |
| `examples/chat-thread/runtime-fatigue.ts` | Fatigue simulation (`npm run observe:runtime-fatigue`) |
| `examples/quiet-observation/horizon-silence.ts` | Horizon silence (`npm run observe:horizon-silence`) |
| `docs/governance/GOVERNANCE_PASS_2026-05-21.md` | Long-horizon governance pass report |
| `examples/chat-thread/README.md` | Chat-thread how-to |
| `test/openless-node.test.ts` | Invariant baseline |
