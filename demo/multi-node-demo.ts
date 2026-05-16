import {
  DeltaSyncer,
  DiffBroadcastPayload,
  EVENT_DIFF_BROADCAST,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  InMemorySyncHub,
  SyncCompletePayload,
  SyncRequestPayload,
  SyncMessage,
  VersionedDiff,
} from "../core/delta-syncer";
import { EventBus } from "../core/event-bus";
import { GlobalState, StateDiff, StateStore } from "../core/state-store";
import {
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  StateUpdatePayload,
  TransitionEngine,
  TransitionErrorPayload,
} from "../core/transition-engine";

const NODE_A = "NODE_A";
const NODE_B = "NODE_B";
const NODE_C = "NODE_C";

interface OpenLessNode {
  readonly label: string;
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly engine: TransitionEngine;
  readonly syncer: DeltaSyncer;
}

function formatState(state: GlobalState): string {
  return `v${state.version} status=${state.status} data=${JSON.stringify(state.data)}`;
}

function logBanner(title: string): void {
  console.log(`\n========== ${title} ==========`);
}

function logNodeState(label: string, store: StateStore): void {
  console.log(`  ${label}: ${formatState(store.getState())}`);
}

function applyAndPublish(node: OpenLessNode, diff: StateDiff): boolean {
  const accepted = node.engine.applyTransition(diff);
  if (!accepted) {
    return false;
  }
  node.syncer.publishDiff(diff);
  return true;
}

function logSynced(label: string, store: StateStore, fromPeerId: string): void {
  const state = store.getState();
  console.log(`
[${label} SYNCED]
version: ${state.version}
status: ${state.status}
data: ${JSON.stringify(state.data)}
from: ${fromPeerId}
`);
}

function wireEngineInboundSync(node: OpenLessNode): void {
  const syncer = node.syncer;
  const original = syncer.handleInboundMessage.bind(syncer);

  syncer.handleInboundMessage = (message: SyncMessage, fromPeerId: string) => {
    if (message.type !== "diff") {
      original(message, fromPeerId);
      return;
    }

    const versioned = message.payload;
    const local = node.store.getState();

    if (versioned.version === local.version + 1) {
      const accepted = node.engine.applyTransition(versioned.diff);
      if (accepted) {
        logSynced(node.label, node.store, fromPeerId);
      }
      return;
    }

    original(message, fromPeerId);
  };
}

function createNode(label: string): OpenLessNode {
  const bus = new EventBus();
  const store = new StateStore({ status: "active" });
  const engine = new TransitionEngine(store, bus);
  const syncer = new DeltaSyncer(label, store, bus);

  bus.subscribe<DiffBroadcastPayload>(EVENT_DIFF_BROADCAST, (p) => {
    if (p.nodeId !== label) {
      return;
    }
    console.log(`[${label}] diff:broadcast v${p.versioned.version} -> ${p.peerIds.join(", ")}`);
  });

  bus.subscribe<TransitionErrorPayload>(EVENT_ERROR_TRANSITION, (p) => {
    console.log(`[${label}] error:transition rule=${p.rule ?? "validation"} reason=${p.reason}`);
  });

  if (label === NODE_A) {
    bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, () => {
      const state = store.getState();
      console.log(`
[NODE_A UPDATED]
version: ${state.version}
status: ${state.status}
data: ${JSON.stringify(state.data)}
`);
    });
  }

  if (label === NODE_B) {
    bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      const state = store.getState();
      console.log(`
[NODE_B SYNCED]
version: ${state.version}
status: ${state.status}
data: ${JSON.stringify(state.data)}
via: sync:complete from ${p.fromPeerId}
`);
    });
  }

  if (label === NODE_C) {
    bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
      console.log(`
[NODE_C] sync:request
local version: ${p.localVersion}
incoming version: ${p.incomingVersion}
peer: ${p.fromPeerId}
`);
    });

    bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      const state = store.getState();
      console.log(`
[NODE_C] sync:complete
version: ${state.version}
status: ${state.status}
data: ${JSON.stringify(state.data)}
from: ${p.fromPeerId}
`);
      console.log(`
[NODE_C SYNCED]
version: ${state.version}
status: ${state.status}
data: ${JSON.stringify(state.data)}
via: sync:complete from ${p.fromPeerId}
`);
    });
  }

  return { label, store, bus, engine, syncer };
}

function printFinalStates(nodes: OpenLessNode[]): void {
  logBanner("FINAL STATES");

  const states = nodes.map((n) => n.store.getState());

  for (const node of nodes) {
    console.log(`${node.label}: ${formatState(node.store.getState())}`);
  }

  const versionsMatch = states.every((s) => s.version === states[0].version);
  const dataMatch = states.every(
    (s) => JSON.stringify(s.data) === JSON.stringify(states[0].data),
  );

  console.log(`
consistency check:
  version match: ${versionsMatch ? "YES" : "NO"}
  data match:    ${dataMatch ? "YES" : "NO"}
`);
}

function simulateGapReceive(
  node: OpenLessNode,
  versioned: VersionedDiff,
  fromPeerId: string,
): void {
  node.syncer.receiveDiff(versioned, fromPeerId);
}

function main(): void {
  console.log("=== OpenLess Multi-Node Demo ===\n");

  const hub = new InMemorySyncHub();
  const nodeA = createNode(NODE_A);
  const nodeB = createNode(NODE_B);
  const nodeC = createNode(NODE_C);

  wireEngineInboundSync(nodeB);
  wireEngineInboundSync(nodeC);

  hub.mesh([nodeA.syncer, nodeB.syncer, nodeC.syncer]);

  console.log("mesh: NODE_A <-> NODE_B <-> NODE_C (full mesh)");
  console.log("relay path: NODE_A -> NODE_B -> NODE_C\n");

  logBanner("STEP 1 - NODE_A applyTransition + publish");

  const diff1: StateDiff = {
    mutation: { data: { counter: 1 } },
    timestamp: Date.now(),
  };

  const ok1 = applyAndPublish(nodeA, diff1);
  console.log(`NODE_A applyTransition: ${ok1 ? "accepted" : "rejected"}`);
  if (ok1) {
    console.log("relay: NODE_A -> NODE_B -> NODE_C");
  }

  logBanner("STATE AFTER STEP 1");
  logNodeState(NODE_A, nodeA.store);
  logNodeState(NODE_B, nodeB.store);
  logNodeState(NODE_C, nodeC.store);

  logBanner("STEP 2 - NODE_C version lag -> sync:request -> sync:complete");

  nodeC.store.resetState({ version: 0, data: {}, status: "active" });
  console.log(`NODE_C reset: ${formatState(nodeC.store.getState())}`);

  simulateGapReceive(
    nodeC,
    {
      version: 2,
      diff: {
        mutation: { data: { counter: 2 } },
        timestamp: Date.now(),
      },
    },
    NODE_B,
  );

  logBanner("STATE AFTER STEP 2");
  logNodeState(NODE_A, nodeA.store);
  logNodeState(NODE_B, nodeB.store);
  logNodeState(NODE_C, nodeC.store);

  printFinalStates([nodeA, nodeB, nodeC]);
}

main();
