# OpenLess

OpenLess is an in-memory **stateful runtime** prototype in TypeScript: a single `GlobalState`, optimistic concurrency via monotonic `version`, incremental `StateDiff` mutations, and multi-node delta replication with full-sync recovery.

**Phase 1 (frozen):** unified write path through `OpenLessNode`, protocol-only `DeltaSyncer`, runtime invariant tests. No production transport, persistence, or agent layer yet.

---

## Runtime Architecture

All runtime mutations go through one entry point:

```text
transport (SyncPeer adapter)
  ↓
OpenLessNode.handleInbound() / applyLocal()
  ↓
DeltaSyncer          (protocol: sequencing, fan-out, gap / full-sync signaling)
  ↓
TransitionEngine   (validate, rules, applyTransition / applyFullSync)
  ↓
StateStore
```

| Layer | Role |
|-------|------|
| **OpenLessNode** | **Only** runtime entry: `applyLocal`, `handleInbound` |
| **DeltaSyncer** | Protocol primitive — does **not** mutate store |
| **TransitionEngine** | Validation, transition rules, `applyFullSync` |
| **StateStore** | In-memory `GlobalState` |
| **EventBus** | In-process events |

- **Local write:** `node.applyLocal(diff)` → `applyTransition` → `publishDiff`
- **Inbound diff:** sequenced (`incoming.version === local.version + 1`) → `applyTransition`; gap → `sync:request` → peer full-sync → `applyFullSync`
- **Inbound full-sync:** `applyFullSync` (structural validation; peer snapshot wins) → `sync:complete`
- **Diff and full-sync** use the same pipeline (no direct `StateStore` writes from sync or transport)

Transport adapters implement `SyncPeer` and deliver `SyncMessage` to `node.handleInbound(message, fromPeerId)` — they must **not** call `TransitionEngine` directly.

---

## Public API

Import from the package root (`index.ts`):

```ts
import {
  OpenLessNode,
  DeltaSyncer,
  TransitionEngine,
  StateStore,
  InMemorySyncHub,
} from "openless";
```

| API | Use |
|-----|-----|
| `new OpenLessNode({ nodeId, initialState?, rules? })` | Create a node |
| `node.applyLocal(diff)` | Local mutation + fan-out |
| `node.handleInbound(message, fromPeerId)` | Inbound transport entry |
| `InMemorySyncHub.link(a, b)` / `.mesh(nodes)` | In-process demo/test wiring |

**Not part of the public contract (removed in Phase 1):** `broadcastDiff`, `receiveDiff`, `handleInboundMessage` on `DeltaSyncer`, demo `wireEngineInboundSync`.

Lower-level access: `node.store`, `node.engine`, `node.syncer`, `node.bus` for demos and tests.

---

## Core types

```ts
interface GlobalState {
  version: number;
  data: Record<string, any>;
  status: "active" | "recovering" | "error";
}

interface StateDiff {
  mutation: Partial<GlobalState>;
  timestamp: number;
}
```

`SyncMessage`: `diff` | `full-sync-request` | `full-sync` — see `ARCHITECTURE.md`.

---

## Events

| Event | When |
|-------|------|
| `state:update` | Successful `applyTransition` or `applyFullSync` |
| `error:transition` | Validation or rule failure |
| `diff:broadcast` | After `publishDiff` |
| `diff:received` | Inbound diff handled (`applied: boolean`) |
| `sync:request` | Version gap |
| `sync:complete` | Full-sync applied |

---

## Tests

Runtime invariants are locked by `npm test` (`node:test` + `ts-node`):

- `applyLocal` → version +1, peer convergence
- Inbound sequenced diff / gap → full-sync convergence
- Duplicate inbound idempotency
- Recovery rejects illegal inbound diff
- Invalid full-sync rejected
- Two-node convergence (applyLocal, gap, duplicate, full-sync)

```bash
npm test
```

---

## Quick start

**Requirements:** Node.js 18+, npm

```bash
npm install
npm test

npx ts-node demo/relay-demo.ts          # recovery rules (no sync)
npm run demo:delta-sync                   # two-node delta + gap
npm run demo:multi-node                   # three-node mesh
```

---

## Repository layout

```text
openless/
├── index.ts              # public exports
├── core/
│   ├── openless-node.ts  # runtime entry
│   ├── delta-syncer.ts   # sync protocol
│   ├── transition-engine.ts
│   ├── state-store.ts
│   └── event-bus.ts
├── test/                 # runtime invariant tests
├── demo/                 # examples (not stable API)
├── schemas/              # placeholder (Phase 2+)
└── agents/               # empty (Phase 5+)
```

---

## Phase 1.5 validation

Minimal real usage (shared todo, `OpenLessNode` only):

```bash
npm run example:shared-todo
```

Findings: `PHASE_1.5_VALIDATION.md` (API friction, events, schema — record only, no runtime refactor).

---

## Roadmap (post–Phase 1)

| Item | Phase |
|------|-------|
| Persistence / WAL | 2 |
| Real `SyncPeer` transport | 3 |
| Daemon / process runtime | 4 |
| Agent layer | 5 |
| Zod schemas on `applyTransition` | 2+ |

Details: `ARCHITECTURE.md`, `NEXT_STEPS.md`, `PROJECT_STATE.md`.

---

## License

ISC
