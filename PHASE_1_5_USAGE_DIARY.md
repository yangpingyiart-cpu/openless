# Phase 1.5 — Usage Diary

Runtime friction observed during real usage validation.  
Sources: `examples/shared-todo/`, `examples/ai-workspace/`, `npm test` (invariants held throughout).

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

**Blocker definition used here:** prevents convergence, breaks OCC invariants, or makes `OpenLessNode`-only integration impossible. None of O-01–O-33 are blockers under this definition.

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

## 2. Friction Categories

### event semantic collapse

| Observation IDs | Summary |
|-----------------|---------|
| O-02, O-03, O-10, O-16 | `state:update` is the default app hook but bundles local write, inbound replicate, and full-sync. No built-in locality or writer attribution. |
| O-18 | Recovery signaling (`sync:complete`) is not uniformly visible on all replicas; observers may only see version bumps. |

**Repeat count:** 2 scenarios (todo, ai-workspace). **Structural failure:** no.

---

### applyLocal awkwardness

| Observation IDs | Summary |
|-----------------|---------|
| O-01, O-04, O-07, O-26 | Boolean result; manual `StateDiff` construction; full top-level blobs; timestamp required; domain rules live in app wrappers. |
| O-13 | Public exports allow skipping the façade. |

**Repeat count:** 2 scenarios. **Structural failure:** no.

---

### multi-writer overwrite

| Observation IDs | Summary |
|-----------------|---------|
| O-08, O-22, O-23, O-24 | Concurrent or duplicate writes: last top-level key wins; version always advances; no merge conflict event. |
| O-14 | Mitigation observed: separate top-level keys per writer role — app convention, not runtime guarantee. |

**Repeat count:** 2 scenarios (duplicate idempotency in both). **Structural failure:** no (convergence held).

---

### recovery cognition

| Observation IDs | Summary |
|-----------------|---------|
| O-06, O-17, O-25 | Lag simulation uses `store.resetState`; full-sync is authoritative snapshot. Works but is not discoverable from `OpenLessNode` API alone. |
| O-19, O-20 | `recovering` rules work when keys are `recovery.*`; illegal domain writes fail closed. |
| O-21 | Errors are per-node bus; observers on other replicas do not see peer transition failures. |

**Repeat count:** 2 scenarios (todo: gap only; workspace: gap + recovering). **Structural failure:** no.

---

### observer ergonomics

| Observation IDs | Summary |
|-----------------|---------|
| O-05, O-15, O-16, O-18, O-21 | Observer pattern viable via `getState()` + derived events; must hand-roll bridge; sync/recovery events uneven across replicas; attribution wrong on derived events. |
| O-09 | Subscription lifecycle is manual. |

**Repeat count:** 2 scenarios. **Structural failure:** no.

---

### schema friction

| Observation IDs | Summary |
|-----------------|---------|
| O-04, O-12, O-25 | `data: Record<string, any>`; app parses/coerces; shallow merge; nested updates need whole-map replacement. |
| O-07 | No zod/runtime schema at boundary (`schemas/` empty). |

**Repeat count:** 2 scenarios. **Structural failure:** no.

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
| O-11, O-14, O-15, O-17, O-20, O-27, O-32, O-33 | `OpenLessNode` + `InMemorySyncHub` sufficient for 2–3 node convergence without sync imports. |

These are recorded so the diary is not only negative signal.

---

## Related files

| File | Role |
|------|------|
| `examples/shared-todo/README.md` | Shared-todo how-to |
| `PHASE_1.5_VALIDATION.md` | Shared-todo (legacy notes) |
| `PHASE_1_5_AI_WORKSPACE_VALIDATION.md` | AI workspace matrix |
| `test/openless-node.test.ts` | Invariant baseline |
