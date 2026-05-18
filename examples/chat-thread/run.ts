/**
 * Phase 1.5 — Chat thread semantic validation (OpenLessNode only).
 */
import {
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  InMemorySyncHub,
  OpenLessNode,
  type StateUpdatePayload,
  type SyncCompletePayload,
  type SyncRequestPayload,
} from "../../index";
import { attachChatEventBridge, type ChatAppEvent } from "./chat-events";
import { ChatClient } from "./chat-client";
import {
  checksum,
  emptyThreadState,
  readThreadState,
  summaryJson,
  threadDiff,
  threadStateToStore,
} from "./thread-model";

const assert = {
  ok(v: boolean, msg = "expected true"): void {
    if (!v) throw new Error(msg);
  },
};

function log(title: string, body: string): void {
  console.log(`\n=== ${title} ===\n${body}`);
}

function versionsLine(nodes: OpenLessNode[]): string {
  return nodes.map((n) => `${n.nodeId}=v${n.store.getState().version}`).join(" ");
}

class ThreadObserver {
  readonly appEvents: ChatAppEvent[] = [];
  readonly runtimeUpdates: number[] = [];
  readonly syncRequests: SyncRequestPayload[] = [];
  readonly syncCompletes: SyncCompletePayload[] = [];
  private readonly detach: () => void;

  constructor(readonly node: OpenLessNode) {
    this.detach = attachChatEventBridge(node, (e) => this.appEvents.push(e));
    node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, (p) => {
      this.runtimeUpdates.push(p.state.version);
    });
    node.bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
      this.syncRequests.push(p);
    });
    node.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      this.syncCompletes.push(p);
    });
  }

  messageCount(): number {
    return Object.keys(readThreadState(this.node.store.getState()).messages).length;
  }

  dispose(): void {
    this.detach();
  }
}

function assertConvergence(nodes: OpenLessNode[], label: string): void {
  const sums = nodes.map((n) => checksum(n.store.getState()));
  const ok = sums.every((s) => s === sums[0]);
  log(
    label,
    [
      versionsLine(nodes),
      `checksum match: ${ok ? "YES" : "NO"}`,
      ...nodes.map((n) => `--- ${n.nodeId} ---\n${summaryJson(n.store.getState())}`),
    ].join("\n\n"),
  );
  assert.ok(ok, `${label}: diverged`);
}

function formatAppEvents(events: ChatAppEvent[]): string {
  if (events.length === 0) return "(none)";
  return events
    .map((e) => {
      if (e.type === "message:appended") {
        return `  v${e.version} message:appended id=${e.messageId} author=${e.message.author} node=${e.nodeId}`;
      }
      return `  v${e.version} ${e.type} node=${e.nodeId}`;
    })
    .join("\n");
}

function main(): void {
  console.log("Phase 1.5 — Chat Thread Validation\n");

  const initial = threadStateToStore(emptyThreadState());
  const windowANode = new OpenLessNode({
    nodeId: "windowA",
    initialState: { data: initial },
  });
  const windowBNode = new OpenLessNode({
    nodeId: "windowB",
    initialState: { data: initial },
  });
  const observerNode = new OpenLessNode({
    nodeId: "observer",
    initialState: { data: initial },
  });

  const hub = new InMemorySyncHub();
  hub.mesh([windowANode, windowBNode, observerNode]);

  const windowA = new ChatClient(windowANode, "windowA");
  const windowB = new ChatClient(windowBNode, "windowB");
  const observer = new ThreadObserver(observerNode);

  let laggedSyncComplete = 0;
  windowBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    laggedSyncComplete += 1;
  });

  const friction: string[] = [];

  // V1 — boot + sequential messages
  log("V1", "Mesh boot; windowA seeds; alternating appends");
  assert.ok(windowA.seedThread());
  assert.ok(windowB.seedThread());
  assert.ok(windowA.appendMessage("user", "Hello from window A") !== null);
  assert.ok(windowB.appendMessage("assistant", "Reply from window B") !== null);
  assert.ok(windowA.setTyping(false));
  assertConvergence([windowANode, windowBNode, observerNode], "V1");

  // V2 — observer only
  log("V2", "Observer: events + getState (no applyLocal)");
  const appended = observer.appEvents.filter((e) => e.type === "message:appended");
  log(
    "V2 observer",
    [
      `app events: ${observer.appEvents.length} message:appended=${appended.length}`,
      `runtime versions: ${observer.runtimeUpdates.join(",")}`,
      `snapshot messages: ${observer.messageCount()}`,
      formatAppEvents(observer.appEvents),
    ].join("\n"),
  );
  assert.ok(appended.length >= 2);
  assert.ok(observer.messageCount() >= 2);
  friction.push(
    "chat observer: message:appended events use observer nodeId, not windowA/windowB",
  );

  // V3 — concurrent append (stale read on shared messages map)
  log("V3", "Concurrent message append (stale read)");
  const snapA = readThreadState(windowANode.store.getState());
  const snapB = readThreadState(windowBNode.store.getState());
  const countBefore = Object.keys(snapA.messages).length;

  assert.ok(
    windowANode.applyLocal(
      threadDiff({
        messages: {
          ...snapA.messages,
          [String(snapA.metadata.nextMessageId)]: {
            role: "user",
            author: "windowA",
            text: "Concurrent A",
            createdAt: Date.now(),
          },
        },
        metadata: {
          nextMessageId: snapA.metadata.nextMessageId + 1,
        },
      }),
    ),
  );
  assert.ok(
    windowBNode.applyLocal(
      threadDiff({
        messages: {
          ...snapB.messages,
          [String(snapB.metadata.nextMessageId)]: {
            role: "user",
            author: "windowB",
            text: "Concurrent B (stale)",
            createdAt: Date.now(),
          },
        },
        metadata: {
          nextMessageId: snapB.metadata.nextMessageId + 1,
        },
      }),
    ),
  );

  const after = readThreadState(windowANode.store.getState());
  const finalCount = Object.keys(after.messages).length;
  const texts = Object.values(after.messages).map((m) => m.text);
  log(
    "V3 result",
    [
      `messages before=${countBefore} after=${finalCount}`,
      `texts: ${JSON.stringify(texts)}`,
      `expected loss: stale append replaces map — only one concurrent msg may survive`,
    ].join("\n"),
  );
  friction.push(
    `chat concurrent append: LWW on whole messages map — ${finalCount - countBefore} msg(s) added, lost parallel append possible`,
  );
  assertConvergence([windowANode, windowBNode, observerNode], "V3");

  // V4 — lag recovery
  log("V4", "windowB lag; windowA appends; full-sync");
  const obsBefore = observer.appEvents.length;
  windowBNode.store.resetState({
    version: 0,
    status: "active",
    data: threadStateToStore(emptyThreadState()),
  });
  friction.push("chat lag: store.resetState — not OpenLessNode API");

  assert.ok(
    windowA.appendMessage("assistant", "Authoritative post-lag message") !== null,
  );
  assertConvergence([windowANode, windowBNode, observerNode], "V4");

  log(
    "V4 recovery",
    [
      `windowB sync:complete=${laggedSyncComplete}`,
      `observer sync:complete=${observer.syncCompletes.length}`,
      `observer events during recovery: ${observer.appEvents.length - obsBefore}`,
    ].join("\n"),
  );
  if (observer.syncCompletes.length === 0 && laggedSyncComplete > 0) {
    friction.push(
      "chat recovery: observer sees state:update not sync:complete",
    );
  }

  // V5 — duplicate replay
  log("V5", "Duplicate identical applyLocal (metadata-only diff)");
  const vBefore = windowANode.store.getState().version;
  const dup = threadDiff({
    metadata: readThreadState(windowANode.store.getState()).metadata,
  });
  assert.ok(windowANode.applyLocal(dup));
  const vMid = windowANode.store.getState().version;
  const dupAgain = windowANode.applyLocal(dup);
  const vAfter = windowANode.store.getState().version;
  log(
    "V5",
    `dup1 v${vBefore}→${vMid} dup2 ok=${dupAgain} v${vMid}→${vAfter}`,
  );
  if (dupAgain && vAfter > vMid) {
    friction.push("chat duplicate applyLocal: version still increments");
  }
  assertConvergence([windowANode, windowBNode, observerNode], "V5 final");

  observer.dispose();
  log("FRICTION", friction.map((f) => `- ${f}`).join("\n"));
  console.log("\n=== CHAT-THREAD VALIDATION COMPLETE ===");
}

main();
