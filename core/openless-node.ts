import {
  DeltaSyncer,
  SyncMessage,
} from "./delta-syncer";
import { EventBus } from "./event-bus";
import { GlobalState, StateDiff, StateStore } from "./state-store";
import { TransitionEngine, TransitionRule } from "./transition-engine";

export interface OpenLessNodeOptions {
  readonly nodeId: string;
  readonly initialState?: Partial<GlobalState>;
  readonly rules?: TransitionRule[];
}

/**
 * Single runtime entry for local and inbound mutations.
 *
 * transport → handleInbound → DeltaSyncer (protocol) → TransitionEngine → StateStore
 */
export class OpenLessNode {
  readonly nodeId: string;
  readonly store: StateStore;
  readonly bus: EventBus;
  readonly engine: TransitionEngine;
  readonly syncer: DeltaSyncer;

  constructor(options: OpenLessNodeOptions) {
    this.nodeId = options.nodeId;
    this.bus = new EventBus();
    this.store = new StateStore(options.initialState);
    this.engine = new TransitionEngine(
      this.store,
      this.bus,
      options.rules,
    );
    this.syncer = new DeltaSyncer(
      this.nodeId,
      this.bus,
      () => this.store.getState().version,
      () => this.store.getState(),
    );
  }

  /** Local write: TransitionEngine then fan-out via DeltaSyncer. */
  applyLocal(diff: StateDiff): boolean {
    const accepted = this.engine.applyTransition(diff);
    if (!accepted) {
      return false;
    }

    this.syncer.publishDiff(diff, this.store.getState().version);
    return true;
  }

  /** Inbound transport entry; all mutations go through TransitionEngine. */
  handleInbound(message: SyncMessage, fromPeerId: string): void {
    switch (message.type) {
      case "diff": {
        const versioned = message.payload;
        const localVersion = this.store.getState().version;

        if (!this.syncer.isSequenced(versioned.version, localVersion)) {
          this.syncer.emitDiffReceived(fromPeerId, versioned, false);
          this.syncer.requestFullSync(fromPeerId, versioned.version);
          return;
        }

        const applied = this.engine.applyTransition(versioned.diff);
        this.syncer.emitDiffReceived(fromPeerId, versioned, applied);
        return;
      }
      case "full-sync-request":
        this.syncer.respondFullSync(fromPeerId);
        return;
      case "full-sync": {
        const applied = this.engine.applyFullSync(message.payload.state);
        if (applied) {
          this.syncer.emitSyncComplete(
            fromPeerId,
            this.store.getState(),
          );
        }
        return;
      }
    }
  }
}
