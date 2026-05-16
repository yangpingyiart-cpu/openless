import { EventBus } from "./event-bus";
import { GlobalState, StateDiff, StateStore } from "./state-store";

export const EVENT_DIFF_BROADCAST = "diff:broadcast";
export const EVENT_DIFF_RECEIVED = "diff:received";
export const EVENT_SYNC_REQUEST = "sync:request";
export const EVENT_SYNC_COMPLETE = "sync:complete";

/** Target version on the source node after `diff` is applied. */
export interface VersionedDiff {
  version: number;
  diff: StateDiff;
}

export type SyncMessage =
  | { type: "diff"; payload: VersionedDiff }
  | { type: "full-sync-request"; payload: { requesterId: string } }
  | { type: "full-sync"; payload: { state: GlobalState } };

/** Outbound channel to a remote node (Redis, WebSocket, NATS, Kafka, ù). */
export interface SyncPeer {
  readonly id: string;
  send(message: SyncMessage): void;
}

export interface DiffBroadcastPayload {
  nodeId: string;
  versioned: VersionedDiff;
  peerIds: string[];
}

export interface DiffReceivedPayload {
  nodeId: string;
  fromPeerId: string;
  versioned: VersionedDiff;
  applied: boolean;
}

export interface SyncRequestPayload {
  nodeId: string;
  localVersion: number;
  incomingVersion: number;
  fromPeerId: string;
}

export interface SyncCompletePayload {
  nodeId: string;
  fromPeerId: string;
  state: GlobalState;
}

/**
 * Replicates {@link StateDiff} across peers using a transport-agnostic {@link SyncPeer}.
 * Replace {@link InMemorySyncHub} with Redis / WebSocket / NATS / Kafka adapters later.
 */
export class DeltaSyncer {
  private readonly peers = new Map<string, SyncPeer>();

  constructor(
    readonly nodeId: string,
    private readonly store: StateStore,
    private readonly bus: EventBus,
  ) {}

  connectPeer(peer: SyncPeer): void {
    this.peers.set(peer.id, peer);
  }

  disconnectPeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  getPeerIds(): string[] {
    return [...this.peers.keys()];
  }

  /**
   * Apply locally, then fan-out to all connected peers.
   */
  broadcastDiff(diff: StateDiff): VersionedDiff {
    const state = this.store.applyDiff(diff);
    return this.publishDiff(diff, state.version);
  }

  /**
   * Fan-out an already-applied diff (e.g. after {@link TransitionEngine.applyTransition}).
   */
  publishDiff(diff: StateDiff, version?: number): VersionedDiff {
    const state = this.store.getState();
    const versioned: VersionedDiff = {
      version: version ?? state.version,
      diff,
    };
    const peerIds = this.getPeerIds();

    this.bus.emit<DiffBroadcastPayload>(EVENT_DIFF_BROADCAST, {
      nodeId: this.nodeId,
      versioned,
      peerIds,
    });

    const message: SyncMessage = { type: "diff", payload: versioned };
    for (const peer of this.peers.values()) {
      peer.send(message);
    }

    return versioned;
  }

  receiveDiff(versioned: VersionedDiff, fromPeerId: string): void {
    const local = this.store.getState();

    if (versioned.version === local.version + 1) {
      this.store.applyDiff(versioned.diff);
      this.emitDiffReceived(fromPeerId, versioned, true);
      return;
    }

    this.emitDiffReceived(fromPeerId, versioned, false);
    this.requestFullSync(fromPeerId, versioned.version);
  }

  private emitDiffReceived(
    fromPeerId: string,
    versioned: VersionedDiff,
    applied: boolean,
  ): void {
    this.bus.emit<DiffReceivedPayload>(EVENT_DIFF_RECEIVED, {
      nodeId: this.nodeId,
      fromPeerId,
      versioned,
      applied,
    });
  }

  requestFullSync(fromPeerId: string, incomingVersion?: number): void {
    const local = this.store.getState();

    this.bus.emit<SyncRequestPayload>(EVENT_SYNC_REQUEST, {
      nodeId: this.nodeId,
      localVersion: local.version,
      incomingVersion: incomingVersion ?? -1,
      fromPeerId,
    });

    const peer = this.peers.get(fromPeerId);
    if (!peer) {
      return;
    }

    peer.send({
      type: "full-sync-request",
      payload: { requesterId: this.nodeId },
    });
  }

  /** Entry point for any transport adapter delivering inbound messages. */
  handleInboundMessage(message: SyncMessage, fromPeerId: string): void {
    switch (message.type) {
      case "diff":
        this.receiveDiff(message.payload, fromPeerId);
        break;
      case "full-sync-request":
        this.respondFullSync(fromPeerId);
        break;
      case "full-sync":
        this.applyFullSync(message.payload.state, fromPeerId);
        break;
    }
  }

  private respondFullSync(toPeerId: string): void {
    const peer = this.peers.get(toPeerId);
    if (!peer) {
      return;
    }

    peer.send({
      type: "full-sync",
      payload: { state: this.store.getState() },
    });
  }

  private applyFullSync(state: GlobalState, fromPeerId: string): void {
    this.store.resetState({
      version: state.version,
      status: state.status,
      data: state.data,
    });

    this.bus.emit<SyncCompletePayload>(EVENT_SYNC_COMPLETE, {
      nodeId: this.nodeId,
      fromPeerId,
      state: this.store.getState(),
    });
  }
}

/** In-memory peer: `send` forwards to the remote syncer's inbound handler. */
export class InMemorySyncPeer implements SyncPeer {
  constructor(
    readonly id: string,
    private readonly onSend: (message: SyncMessage) => void,
  ) {}

  send(message: SyncMessage): void {
    this.onSend(message);
  }
}

/**
 * Links {@link DeltaSyncer} nodes in-process for demos and tests.
 * Production: implement {@link SyncPeer} over your message bus instead.
 */
export class InMemorySyncHub {
  link(a: DeltaSyncer, b: DeltaSyncer): void {
    const peerB = new InMemorySyncPeer(b.nodeId, (message) =>
      b.handleInboundMessage(message, a.nodeId),
    );
    const peerA = new InMemorySyncPeer(a.nodeId, (message) =>
      a.handleInboundMessage(message, b.nodeId),
    );

    a.connectPeer(peerB);
    b.connectPeer(peerA);
  }

  mesh(syncers: DeltaSyncer[]): void {
    for (let i = 0; i < syncers.length; i++) {
      for (let j = i + 1; j < syncers.length; j++) {
        this.link(syncers[i], syncers[j]);
      }
    }
  }
}
