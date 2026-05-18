# Phase 1.5 — Chat Thread Validation Report

**Date:** 2026-05-17  
**Domain:** `examples/chat-thread/`  
**Command:** `npm run example:chat-thread`  
**Runtime:** `OpenLessNode` only — no `core/` changes

---

## Goal

Validate whether OpenLess can model **multi-window / multi-agent shared chat thread state** (messages, metadata, presence) under Phase 1 semantics, without CRDT, OT, persistence, or transport.

---

## Architecture

```text
windowA / windowB          observer
     │                        │
     └──── ChatClient ────────┘ (read-only + event bridge)
              │
         applyLocal / getState
              │
         OpenLessNode ← InMemorySyncHub.mesh
```

| Module | Responsibility |
|--------|----------------|
| `thread-model.ts` | `messages`, `metadata`, `thread`, `presence` top-level keys |
| `chat-client.ts` | Append message, set typing — writes via `applyLocal` only |
| `chat-events.ts` | Derive `message:appended`, `presence:changed` from `state:update` |
| `run.ts` | V1–V5 scenarios + friction capture |

---

## Scenario Matrix

| ID | Scenario | Expected | Observed | Pass |
|----|----------|----------|----------|------|
| V1 | Sequential appends (2 windows) | Converge; 2 messages | v5; checksum YES | ✅ |
| V2 | Observer node | Events + snapshot; no writes | 2× `message:appended`; count=2 | ✅ |
| V3 | Concurrent message append | Convergence; document LWW loss | 3 msgs; A's concurrent text lost; B wins id=3 | ✅ |
| V4 | Lag recovery | Full-sync; converge | windowB `sync:complete=1`; v8; 4 msgs | ✅ |
| V5 | Duplicate replay | Version behavior documented | v8→v10 on metadata noop | ✅ |

**Invariant regression:** `npm test` — 7/7 pass (unchanged).

---

## Key Findings

### What works

- **3-node mesh** (2 writers + 1 observer) converges on every step.
- **Sequential chat** with fresh reads: message ids monotonic, all replicas agree.
- **Observer pattern** viable: `getState()` + derived `message:appended` events.
- **Gap recovery** via version-0 reset → authoritative peer append → full-sync.
- **`presence` partition** avoids fighting `messages` on typing updates.

### Confirmed frictions (see diary O-34–O-42)

| Friction | Chat-thread evidence |
|----------|----------------------|
| Multi-writer overwrite | V3: stale concurrent append drops peer message |
| Observer attribution | V2: `nodeId=observer` on derived events |
| Recovery visibility | V4: `sync:complete` only on lagged replica |
| Idempotency | V5: duplicate `applyLocal` bumps version |
| applyLocal ergonomics | Full `messages` map per append |
| Lag simulation | `store.resetState` not Node API |

### Chat-specific insight

A natural chat model (append to shared `messages` map + increment `nextMessageId`) **aliases to LWW on the entire map**. Under concurrent stale reads, one window's message is silently dropped while replicas still converge. This is **semantically correct for Phase 1 shallow merge**, but **wrong for product chat** without either:

- per-writer top-level keys (app convention), or
- CRDT/OT (explicitly out of scope).

---

## Decision

| Question | Answer |
|----------|--------|
| Runtime redesign required? | **No** |
| Qualifies under Decision Rule §3? | **No** — convergence held; patterns repeat across 3 domains |
| Phase 2 backlog? | Ergonomics only (actor on events, apply result detail, optional op id) |

---

## Artifacts

| File | Role |
|------|------|
| `examples/chat-thread/run.ts` | Executable validation |
| `PHASE_1_5_USAGE_DIARY.md` | O-34–O-42 + § Chat Thread Validation |
| `package.json` | `example:chat-thread` script |

---

## Commands

```bash
npm test
npm run example:chat-thread
```
