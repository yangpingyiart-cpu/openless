# OpenLess Guarantee Matrix

Phase 1.6 — explicit **GUARANTEED** vs **NOT GUARANTEED** vs **PARTIALLY GUARANTEED** surfaces.

Most distributed systems under-document what they do **not** promise. OpenLess does the opposite.

**Scope:** Phase 1 runtime (`OpenLessNode`, `DeltaSyncer`, `TransitionEngine`, `StateStore`, in-memory hub). Evidence: `npm test`, usage validations, law probes.

---

# GUARANTEED

## Deterministic Convergence

**Meaning:** Given the same ordered application of accepted diffs and full-sync snapshots, all connected replicas reach the same final `GlobalState` (version + shallow-merged `data`).

**Status:** GUARANTEED

**Evidence:** 7/7 invariant tests; 0 convergence failures in chat-thread long-run (11 checks); law probes 001–007 protocol outcomes.

---

## Eventual Replica Equality

**Meaning:** After sync completes following gaps, all meshed replicas share identical checksum of state (under shared merge rules).

**Status:** GUARANTEED

**Evidence:** `assertConvergence` patterns; `004-observer-recovery`, `006-lag-oscillation`.

---

## Inbound Replay Idempotence (Duplicate Suppression)

**Meaning:** Re-applying the same inbound diff at the same version does not mutate state or version on the receiver.

**Status:** GUARANTEED (inbound path)

**Evidence:** `test/openless-node.test.ts` duplicate inbound case.

**Note:** Local `applyLocal` duplicate is **not** covered — see NOT GUARANTEED.

---

## Full-State Convergence on Gap

**Meaning:** On version gap, replica requests full sync and applies authoritative snapshot to catch up.

**Status:** GUARANTEED

**Evidence:** Invariant gap test; chat-thread V4/LR4; law-probe `006-lag-oscillation`.

---

## OCC Version Monotonicity

**Meaning:** Accepted transitions advance `version` by +1 per applied diff on that replica; inbound diffs require `diff.version === local.version + 1`.

**Status:** GUARANTEED

**Evidence:** Transition engine + syncer tests.

---

## Recovering-State Write Constraints

**Meaning:** When `status === recovering`, only allowed keys (e.g. `recovery.*`) accept `applyLocal`; illegal domain writes fail closed.

**Status:** GUARANTEED (when rules configured)

**Evidence:** ai-workspace V4b; invariant recovering test.

---

# NOT GUARANTEED

## Semantic Append Preservation

**Meaning:** Append-like intent on a shared top-level map may collapse under concurrent stale writes.

**Status:** NOT GUARANTEED

**Evidence:** LAW-001; `002-stale-overwrite`; chat-thread V3/LR2/LR6.

---

## Semantic Causality

**Meaning:** Order of user intent is not preserved when conflicts occur; no happens-before exposed between writers.

**Status:** NOT GUARANTEED

**Evidence:** LWW; `003-replay-ambiguity`.

---

## Operation History Readability

**Meaning:** Runtime does not retain an auditable log of superseded branches or rejected intents.

**Status:** NOT GUARANTEED

**Evidence:** LAW-004 full-sync; LAW-003 ambiguity.

---

## Semantic Progress Tracking

**Meaning:** `version` does not track messages, todos, edits, or agent steps.

**Status:** NOT GUARANTEED

**Evidence:** LAW-002; `005-version-inflation`; LR5 (+16 version, 0 new messages).

---

## Human-Intuitive Versions

**Meaning:** Version numbers are not suitable as user-visible “activity level” without app mapping.

**Status:** NOT GUARANTEED

**Evidence:** v146 / 98 messages long-run.

---

## Local Apply Idempotence

**Meaning:** Duplicate identical `applyLocal` may advance version and emit `state:update`.

**Status:** NOT GUARANTEED

**Evidence:** `001-noop-replay`; chat-thread V5; O-08, O-40.

---

## Writer Attribution on Events

**Meaning:** `state:update` does not include actor, op id, or local-vs-remote flag.

**Status:** NOT GUARANTEED

**Evidence:** O-03, O-16, O-35; derived events use observer `nodeId`.

---

## Uniform Recovery Telemetry

**Meaning:** `sync:complete` and gap narrative are not visible on all replicas.

**Status:** NOT GUARANTEED

**Evidence:** O-18, O-39; `004-observer-recovery` (observer sync:complete=0).

---

## Draft Preservation on Lagging Replica

**Meaning:** Unmerged local changes on keys touched by authoritative full-sync are discarded.

**Status:** NOT GUARANTEED

**Evidence:** LAW-004; O-25.

---

## Field-Level Merge

**Meaning:** Nested objects are not deep-merged; top-level key replacement only.

**Status:** NOT GUARANTEED

**Evidence:** `SEMANTICS.md`; whole-map chat/todo patterns.

---

## Logical-Send Count Reconciliation

**Meaning:** A count of successful `applyLocal` calls (or logical sends) will match converged domain keys after stale/concurrent whole-map loss.

**Status:** NOT GUARANTEED

**Evidence:** `007-semantic-divergence`; chat-thread long-run gap 0→22 with 0 convergence failures; OBS-001 (withheld — cognition metric on LAW-001).

---

# PARTIALLY GUARANTEED

## Observer Interpretability

**Meaning:** Observers can read final state and subscribe to updates; interpretability of *who* did *what* and *how* recovery happened requires app discipline.

**Status:** PARTIALLY GUARANTEED

**Depends on:** App event bridge, op ids, not using version as semantic counter.

**Evidence:** LAW-005; observer snapshots match in LR3.

---

## Recovery Transparency

**Meaning:** Convergence after lag is guaranteed; transparency of loss and sync lifecycle is app/test-hook dependent.

**Status:** PARTIALLY GUARANTEED

**Depends on:** Subscribing on lagged replica, app-side draft storage, documenting `resetState` test hook.

**Evidence:** LR4; `004-observer-recovery`.

---

## Semantic Continuity

**Meaning:** Sequential writes with fresh reads on non-overlapping keys maintain intuitive continuity; shared-key concurrency breaks continuity silently.

**Status:** PARTIALLY GUARANTEED

**Depends on:** Key partitioning (ai-workspace planner/coder), single-writer-per-key conventions.

**Evidence:** O-14, O-32, O-42 vs O-36, O-44.

---

## Conflict Signaling

**Meaning:** Illegal transitions emit `error:transition` on the **local** node bus only.

**Status:** PARTIALLY GUARANTEED

**Depends on:** Subscribing on writing replica; not visible on observer (O-21).

---

# Summary Table

| Surface | Status |
|---------|--------|
| Final-state convergence | GUARANTEED |
| Inbound duplicate suppression | GUARANTEED |
| Gap full-sync catch-up | GUARANTEED |
| Append / intent preservation | NOT GUARANTEED |
| Version = semantic progress | NOT GUARANTEED |
| Local noop idempotence | NOT GUARANTEED |
| Recovery story on all replicas | NOT GUARANTEED |
| Observer “who wrote” | PARTIALLY GUARANTEED |
| Multi-writer chat on one map | NOT GUARANTEED |
| Logical-send count vs store after LWW loss | NOT GUARANTEED |

---

## Related

- `RUNTIME_LAWS.md`
- `SEMANTIC_FAILURE_MODES.md`
- `NON_GOALS.md` (root)
