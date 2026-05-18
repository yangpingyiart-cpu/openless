import {
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  type StateUpdatePayload,
  type SyncCompletePayload,
} from "../../../index";
import { mesh, mkNode, diff, converged, checksum, emit } from "../_shared/probe-kit";

const probeId = "004-observer-recovery";

function main(): void {
  const writer = mkNode("writer", { items: { "1": "hello" }, nextId: 2 });
  const lagged = mkNode("lagged", { items: { "1": "hello" }, nextId: 2 });
  const observer = mkNode("observer", { items: { "1": "hello" }, nextId: 2 });
  mesh([writer, lagged, observer]);

  let observerSyncComplete = 0;
  let observerStateUpdates = 0;
  observer.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    observerSyncComplete += 1;
  });
  observer.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, () => {
    observerStateUpdates += 1;
  });

  let laggedSyncComplete = 0;
  lagged.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    laggedSyncComplete += 1;
  });

  lagged.store.resetState({ version: 0, status: "active", data: { items: {}, nextId: 1 } });
  writer.applyLocal(diff({ items: { "1": "hello", "2": "after-lag" }, nextId: 3 }));

  const obsSum = checksum(observer.store.getState());
  const writerSum = checksum(writer.store.getState());
  const equal = obsSum === writerSum;

  emit(probeId, {
    observedBehavior: `observer sync:complete=${observerSyncComplete} state:update=${observerStateUpdates}; lagged sync:complete=${laggedSyncComplete}`,
    stableBehavior: "chat-thread LR4/LR6: observer never sees sync:complete; checksum equality still holds",
    semanticOutcome: equal
      ? "Observer confirms final equality without reconstruction history"
      : "Observer snapshot differs from writer",
    protocolOutcome: converged([writer, lagged, observer])
      ? "Full-sync recovery converged all replicas"
      : "Convergence failure",
  });
}

main();
