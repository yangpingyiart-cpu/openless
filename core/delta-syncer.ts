import { EventBus } from "./event-bus";
import { GlobalState, StateDiff } from "./state-store";

/** Minimal surface for in-process transport wiring. */
export interface InboundHandler {
  readonly nodeId: string;
  readonly syncer: DeltaSyncer;
  handleInbound(message: SyncMessage, fromPeerId: string): void;
}

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

/** Outbound channel to a remote node (Redis, WebSocket, NATS, Kafka, …). */
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
 * Protocol-only sync primitive: sequencing, fan-out, gap / full-sync signaling.
 * Does not mutate {@link GlobalState}; the owning {@link OpenLessNode} applies changes.
 */
export class DeltaSyncer {
  private readonly peers = new Map<string, SyncPeer>();

  constructor(
    readonly nodeId: string,
    private readonly bus: EventBus,
    private readonly getLocalVersion: () => number,
    private readonly getLocalState: () => GlobalState,
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

  isSequenced(incomingVersion: number, localVersion: number): boolean {
    return incomingVersion === localVersion + 1;
  }

  /** Fan-out an already-applied diff (version from {@link OpenLessNode.applyLocal}). */
  publishDiff(diff: StateDiff, version: number): VersionedDiff {
    const versioned: VersionedDiff = { version, diff };
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

  emitDiffReceived(
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
    const localVersion = this.getLocalVersion();

    this.bus.emit<SyncRequestPayload>(EVENT_SYNC_REQUEST, {
      nodeId: this.nodeId,
      localVersion,
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

  respondFullSync(toPeerId: string): void {
    const peer = this.peers.get(toPeerId);
    if (!peer) {
      return;
    }

    peer.send({
      type: "full-sync",
      payload: { state: this.getLocalState() },
    });
  }

  emitSyncComplete(fromPeerId: string, state: GlobalState): void {
    this.bus.emit<SyncCompletePayload>(EVENT_SYNC_COMPLETE, {
      nodeId: this.nodeId,
      fromPeerId,
      state,
    });
  }
}

/** In-memory peer: `send` forwards to the remote node's inbound handler. */
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
 * Links {@link OpenLessNode} instances in-process for demos and tests.
 * Production: implement {@link SyncPeer} over your message bus instead.
 */
export class InMemorySyncHub {
  link(a: InboundHandler, b: InboundHandler): void {
    const peerB = new InMemorySyncPeer(b.nodeId, (message) =>
      b.handleInbound(message, a.nodeId),
    );
    const peerA = new InMemorySyncPeer(a.nodeId, (message) =>
      a.handleInbound(message, b.nodeId),
    );

    a.syncer.connectPeer(peerB);
    b.syncer.connectPeer(peerA);
  }

  mesh(nodes: InboundHandler[]): void {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        this.link(nodes[i], nodes[j]);
      }
    }
  }
}
