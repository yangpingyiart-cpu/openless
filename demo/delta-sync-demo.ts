import {
  DeltaSyncer,
  DiffBroadcastPayload,
  DiffReceivedPayload,
  EVENT_DIFF_BROADCAST,
  EVENT_DIFF_RECEIVED,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  InMemorySyncHub,
  SyncCompletePayload,
  SyncRequestPayload,
} from "../core/delta-syncer";
import { EventBus } from "../core/event-bus";
import { StateStore } from "../core/state-store";

function createNode(id: string) {
  const bus = new EventBus();
  const store = new StateStore();
  const syncer = new DeltaSyncer(id, store, bus);

  bus.subscribe<DiffBroadcastPayload>(EVENT_DIFF_BROADCAST, (p) => {
    console.log(`[${p.nodeId}] diff:broadcast -> v${p.versioned.version} peers=${p.peerIds.join(",")}`);
  });

  bus.subscribe<DiffReceivedPayload>(EVENT_DIFF_RECEIVED, (p) => {
    console.log(
      `[${p.nodeId}] diff:received <- ${p.fromPeerId} v${p.versioned.version}`,
    );
  });

  bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
    console.log(
      `[${p.nodeId}] sync:request (local v${p.localVersion}, incoming v${p.incomingVersion}, peer ${p.fromPeerId})`,
    );
  });

  bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
    console.log(
      `[${p.nodeId}] sync:complete <- ${p.fromPeerId} v${p.state.version} status=${p.state.status}`,
    );
  });

  return { id, bus, store, syncer };
}

function logState(label: string, store: StateStore): void {
  const s = store.getState();
  console.log(`${label}: v${s.version} status=${s.status} data=${JSON.stringify(s.data)}`);
}

function main(): void {
  console.log("=== DeltaSyncer Demo (in-memory transport) ===\n");

  const hub = new InMemorySyncHub();
  const nodeA = createNode("node-a");
  const nodeB = createNode("node-b");
  const nodeC = createNode("node-c");

  hub.mesh([nodeA.syncer, nodeB.syncer, nodeC.syncer]);

  console.log("--- Step 1: node-a broadcasts (all peers catch up) ---");
  nodeA.syncer.broadcastDiff({
    mutation: { data: { counter: 1 }, status: "active" },
    timestamp: Date.now(),
  });

  logState("node-a", nodeA.store);
  logState("node-b", nodeB.store);
  logState("node-c", nodeC.store);

  console.log("\n--- Step 2: node-b broadcasts ---");
  nodeB.syncer.broadcastDiff({
    mutation: { data: { counter: 2 } },
    timestamp: Date.now(),
  });

  logState("node-a", nodeA.store);
  logState("node-b", nodeB.store);
  logState("node-c", nodeC.store);

  console.log("\n--- Step 3: node-c at v0, receives v2 (gap) -> full sync ---");
  nodeC.store.resetState({ version: 0, data: {}, status: "active" });
  logState("node-c (reset)", nodeC.store);

  nodeC.syncer.receiveDiff(
    {
      version: 2,
      diff: { mutation: { data: { counter: 2 } }, timestamp: Date.now() },
    },
    "node-b",
  );

  logState("node-a", nodeA.store);
  logState("node-b", nodeB.store);
  logState("node-c (after full sync)", nodeC.store);

  console.log("\n--- FINAL ---");
  logState("FINAL node-a", nodeA.store);
  logState("FINAL node-b", nodeB.store);
  logState("FINAL node-c", nodeC.store);
}

main();
