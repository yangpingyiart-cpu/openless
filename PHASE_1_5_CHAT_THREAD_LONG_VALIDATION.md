# Phase 1.5 — Chat Thread Long-Run Validation Report

**Date:** 2026-05-17  
**Script:** `npm run example:chat-thread-long`  
**Focus:** Cognition pressure over continuous usage — **not** runtime correctness

---

## Setup

| Component | Role |
|-----------|------|
| `windowA` / `windowB` | Writers |
| `observer` / `observer2` | Observer-only replicas |
| `CognitionLedger` | Classifies friction: repeating / accumulating / one-shot |
| `simulation-harness` | Stale pairs, lag loops, mesh |

**Constraints honored:** no `core/` changes, no CRDT/OT/transport/persistence, no new runtime features.

---

## Scenarios (LR1–LR6)

| Phase | Simulation | Rounds | Purpose |
|-------|------------|--------|---------|
| LR1 | Long append session | 40 | Fresh-read chat under load |
| LR2 | Repeated stale-read pairs | 12 | Concurrent append cognition |
| LR3 | Observer-only windows | 20 ticks × 2 observers | Read path + derived events |
| LR4 | Lag / recovery loops | 6 | `resetState` + full-sync |
| LR5 | Repeated duplicate replay | 8 × 2 dup | Noop idempotency pressure |
| LR6 | Concurrent append loops | 10 | Stale burst after each pre-append |

---

## Representative Run Results

| Metric | Value |
|--------|-------|
| Logical sends | 120 |
| Final store messages | 98 |
| **Send gap** | **22** (0 after LR1 → 22 after LR6) |
| Messages lost (stale) | 22 / 22 pairs |
| Noop replay version bumps | 16 |
| Final version | 146 |
| Lag loops | 6 (observer `sync:complete` = 0 each time) |
| Convergence checks | 11 (**0 failures**) |

### Send-gap trajectory

```text
LR1  gap=0   (40 sequential appends — mental model OK)
LR2  gap=12  (stale loops — first accumulation)
LR3  gap=12  (observers see events; gap frozen)
LR4  gap=12  (lag recovery does not heal send gap)
LR5  gap=12  (noop replay adds version, not messages)
LR6  gap=22  (more stale bursts — gap grows again)
```

---

## Friction Classification

### REPEATING (background noise every session)

| Friction | Evidence |
|----------|----------|
| `overwrite_lww` | 22/22 stale pairs lost exactly 1 message |
| `full_map_rewrite` | Every append replaces entire `messages` map |
| `recovery_visibility` | 6/6 lag loops: observer never sees `sync:complete` |
| `lag_reset_store` | Lag via `store.resetState` each loop |
| `applylocal_opaque` | Boolean `applyLocal`; reason not in return value |

**Developer effect:** These feel “normal” after the first hour — not bugs, but **constant vigilance**.

### ACCUMULATING (confusion compounds)

| Friction | Evidence |
|----------|----------|
| `sent_vs_store_gap` | 120 sends vs 98 stored — gap never shrinks |
| Version vs message count | v146 for 98 messages (+16 from noop replay alone) |

**Developer effect:**

- “How many messages did we send?” ≠ “How many are in the thread?”
- Version becomes a misleading progress indicator for UIs and agents.
- Long-running agents **lose trust** in local send counters even when sync “works.”

### ONE_SHOT (learn once)

| Friction | Evidence |
|----------|----------|
| `lag_reset_store` API | First encounter awkward; later loops are procedural |
| Event bridge setup | `attachChatEventBridge` + `unsubscribe` reference |
| `semantic_collapse` | Documented once: all hooks look like `state:update` |

---

## What Did NOT Accumulate

| Expectation | Observation |
|-------------|-------------|
| Convergence failures | 0 across 11 checks |
| Observer blocked | Read-only path works for 2 observers |
| Sequential chat (LR1) | gap=0 — fresh reads trustworthy |
| Presence partition | Typing on separate key — no extra loss |

---

## Decision

| Question | Answer |
|----------|--------|
| Runtime redesign? | **No** |
| New infra / transport? | **No** (explicitly out of scope) |
| Primary risk | **Semantic**: silent message loss + version noise under multi-writer chat |
| Backlog | Ergonomics: op ids, actor on events, send acknowledgment, typed reads |

---

## Commands

```bash
npm test
npm run example:chat-thread       # short matrix
npm run example:chat-thread-long  # this report
```

**Diary:** O-43–O-52 in `PHASE_1_5_USAGE_DIARY.md`
