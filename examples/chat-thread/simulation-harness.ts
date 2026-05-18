import {
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  InMemorySyncHub,
  OpenLessNode,
  type StateUpdatePayload,
  type SyncCompletePayload,
} from "../../index";
import { attachChatEventBridge, type ChatAppEvent } from "./chat-events";
import { ChatClient } from "./chat-client";
import type { CognitionLedger } from "./validation-diagnostics";
import {
  checksum,
  emptyThreadState,
  readThreadState,
  threadDiff,
  threadStateToStore,
  type ChatMessage,
  type ChatThreadState,
} from "./thread-model";

export interface ChatMesh {
  readonly windowANode: OpenLessNode;
  readonly windowBNode: OpenLessNode;
  readonly observerNode: OpenLessNode;
  readonly observer2Node: OpenLessNode;
  readonly windowA: ChatClient;
  readonly windowB: ChatClient;
  readonly allNodes: OpenLessNode[];
  readonly writers: OpenLessNode[];
}

export class ThreadObserver {
  readonly appEvents: ChatAppEvent[] = [];
  readonly runtimeUpdates: number[] = [];
  readonly syncCompletes: SyncCompletePayload[] = [];
  private readonly detach: () => void;

  constructor(readonly node: OpenLessNode) {
    this.detach = attachChatEventBridge(node, (e) => this.appEvents.push(e));
    node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, (p) => {
      this.runtimeUpdates.push(p.state.version);
    });
    node.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      this.syncCompletes.push(p);
    });
  }

  derivedAppends(): number {
    return this.appEvents.filter((e) => e.type === "message:appended").length;
  }

  messageCount(): number {
    return Object.keys(readThreadState(this.node.store.getState()).messages).length;
  }

  dispose(): void {
    this.detach();
  }
}

export function createChatMesh(): ChatMesh {
  const initial = threadStateToStore(emptyThreadState());
  const mk = (nodeId: string) =>
    new OpenLessNode({ nodeId, initialState: { data: initial } });

  const windowANode = mk("windowA");
  const windowBNode = mk("windowB");
  const observerNode = mk("observer");
  const observer2Node = mk("observer2");
  const allNodes = [windowANode, windowBNode, observerNode, observer2Node];

  const hub = new InMemorySyncHub();
  hub.mesh(allNodes);

  return {
    windowANode,
    windowBNode,
    observerNode,
    observer2Node,
    windowA: new ChatClient(windowANode, "windowA"),
    windowB: new ChatClient(windowBNode, "windowB"),
    allNodes,
    writers: [windowANode, windowBNode],
  };
}

export function checksumsMatch(nodes: OpenLessNode[]): boolean {
  const sums = nodes.map((n) => checksum(n.store.getState()));
  return sums.every((s) => s === sums[0]);
}

export function recordConvergence(
  ledger: CognitionLedger,
  nodes: OpenLessNode[],
  phase: string,
): void {
  const ok = checksumsMatch(nodes);
  ledger.noteConvergence(ok);
  if (!ok) {
    ledger.record("overwrite_lww", phase, "checksum mismatch — unexpected");
  }
}

/** Capture snapshot then append — simulates stale read if caller holds snapshot. */
export function appendFromSnapshot(
  client: ChatClient,
  snapshot: ChatThreadState,
  role: ChatMessage["role"],
  text: string,
): string | null {
  const id = String(snapshot.metadata.nextMessageId);
  const messages = {
    ...snapshot.messages,
    [id]: {
      role,
      author: client.windowId,
      text,
      createdAt: Date.now(),
    },
  };
  const metadata = {
    ...snapshot.metadata,
    nextMessageId: snapshot.metadata.nextMessageId + 1,
  };
  const ok = client.node.applyLocal(threadDiff({ messages, metadata }));
  return ok ? id : null;
}

/** Both windows append from the same stale baseline; at most one new id survives. */
export function staleConcurrentPair(
  mesh: ChatMesh,
  ledger: CognitionLedger,
  phase: string,
  label: string,
): { messagesAdded: number; messagesLost: number } {
  const snap = readThreadState(mesh.windowANode.store.getState());
  const before = Object.keys(snap.messages).length;

  appendFromSnapshot(mesh.windowA, snap, "user", `${label}-A`);
  appendFromSnapshot(mesh.windowB, snap, "user", `${label}-B`);

  const after = Object.keys(
    readThreadState(mesh.windowANode.store.getState()).messages,
  ).length;
  const added = after - before;
  const lost = Math.max(0, 2 - added);
  ledger.noteStalePair(lost);
  ledger.record("full_map_rewrite", phase, `stale pair ${label}: +${added} stored, ${lost} lost`);
  return { messagesAdded: added, messagesLost: lost };
}

export function simulateLag(
  lagged: OpenLessNode,
  ledger: CognitionLedger,
  phase: string,
): void {
  lagged.store.resetState({
    version: 0,
    status: "active",
    data: threadStateToStore(emptyThreadState()),
  });
  ledger.record("lag_reset_store", phase, `${lagged.nodeId} reset to v0`);
}

export function versionsLine(nodes: OpenLessNode[]): string {
  return nodes.map((n) => `${n.nodeId}=v${n.store.getState().version}`).join(" ");
}

export function logSection(title: string, body: string): void {
  console.log(`\n=== ${title} ===\n${body}`);
}
