/**
 * Phase 1.5 — Shared Todo usage validation (OpenLessNode only).
 */
import {
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  InMemorySyncHub,
  OpenLessNode,
  type StateUpdatePayload,
  type SyncCompletePayload,
  type SyncRequestPayload,
  type TransitionErrorPayload,
} from "../../index";
import { TodoClient } from "./todo-client";
import { attachTodoEventBridge, type TodoAppEvent } from "./todo-events";
import {
  checksum,
  emptyTodoState,
  readTodoState,
  summaryJson,
  todoDiff,
  todoStateToStore,
} from "./todo-model";

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

class TodoObserver {
  readonly appEvents: TodoAppEvent[] = [];
  readonly runtimeUpdates: number[] = [];
  readonly syncRequests: SyncRequestPayload[] = [];
  readonly syncCompletes: SyncCompletePayload[] = [];
  private readonly detach: () => void;

  constructor(readonly node: OpenLessNode) {
    this.detach = attachTodoEventBridge(node, (e) => this.appEvents.push(e));
    node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, (p) => {
      this.runtimeUpdates.push(p.state.version);
    });
    node.bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
      this.syncRequests.push(p);
    });
    node.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      this.syncCompletes.push(p);
    });
    node.bus.subscribe<TransitionErrorPayload>(EVENT_ERROR_TRANSITION, (p) => {
      console.log(
        `[${node.nodeId}] error:transition ${p.rule ?? "validation"}: ${p.reason}`,
      );
    });
  }

  view() {
    return readTodoState(this.node.store.getState());
  }

  dispose(): void {
    this.detach();
  }
}

function assertConvergence(
  nodes: OpenLessNode[],
  label: string,
): string {
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
  assert.ok(ok, `${label}: divergence`);
  return sums[0]!;
}

function formatEventLog(events: TodoAppEvent[]): string {
  if (events.length === 0) return "(none)";
  return events
    .map(
      (e) =>
        `  v${e.version} ${e.type} todo=${"todoId" in e ? e.todoId : "-"} node=${e.nodeId}`,
    )
    .join("\n");
}

function main(): void {
  console.log("Phase 1.5 — Shared Todo Validation\n");
  const friction: string[] = [];
  const initial = todoStateToStore(emptyTodoState());

  const userANode = new OpenLessNode({
    nodeId: "userA",
    initialState: { data: initial },
  });
  const userBNode = new OpenLessNode({
    nodeId: "userB",
    initialState: { data: initial },
  });
  const observerNode = new OpenLessNode({
    nodeId: "observer",
    initialState: { data: initial },
  });

  const hub = new InMemorySyncHub();
  hub.mesh([userANode, userBNode, observerNode]);

  const userA = new TodoClient(userANode, "userA", "Alice");
  const userB = new TodoClient(userBNode, "userB", "Bob");
  const observer = new TodoObserver(observerNode);

  let laggedSyncComplete = 0;
  userBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    laggedSyncComplete += 1;
  });

  // --- V1: boot + initial todo ---
  log("V1", "Three nodes; userA seeds and creates todos");
  assert.ok(userA.seedBoard());
  assert.ok(userB.seedBoard());
  const t1 = userA.addTodo("Buy milk");
  const t2 = userA.addTodo("Write diary entry");
  assert.ok(t1 !== null && t2 !== null);
  assert.ok(userA.setPresence("board"));
  assertConvergence([userANode, userBNode, observerNode], "V1");

  // --- V2: collaborative edits on different todos ---
  log("V2", "userB edits t1 title; userA completes t2; userB assigns t1");
  assert.ok(userB.editTodoTitle("1", "Buy oat milk"));
  assert.ok(userA.completeTodo("2", true));
  assert.ok(userB.assignTodo("1", "userB"));
  assertConvergence([userANode, userBNode, observerNode], "V2");

  // --- V3: observer only ---
  log("V3", "Observer: events + getState() only (no applyLocal)");
  const added = observer.appEvents.filter((e) => e.type === "todo:added");
  const completed = observer.appEvents.filter((e) => e.type === "todo:completed");
  log(
    "V3 observer log",
    [
      `app events: ${observer.appEvents.length}`,
      `todo:added=${added.length} todo:completed=${completed.length}`,
      `runtime state:update versions: ${observer.runtimeUpdates.join(",")}`,
      `sync:request=${observer.syncRequests.length} sync:complete=${observer.syncCompletes.length}`,
      `snapshot todos: ${Object.keys(observer.view().todos).length}`,
      formatEventLog(observer.appEvents.slice(-8)),
    ].join("\n"),
  );
  assert.ok(observer.appEvents.length > 0);
  assert.ok(added.length >= 2);
  friction.push(
    "observer semantics: derived todo events use observer nodeId, not userA/userB writer",
  );

  // --- V4: concurrent edit same todo ---
  log("V4", "Concurrent edit on todo 1 (stale read)");
  const snapA = readTodoState(userANode.store.getState());
  const snapB = readTodoState(userBNode.store.getState());
  assert.ok(
    userANode.applyLocal(
      todoDiff({
        todos: {
          ...snapA.todos,
          "1": { ...snapA.todos["1"]!, title: "Title from userA" },
        },
      }),
    ),
  );
  assert.ok(
    userBNode.applyLocal(
      todoDiff({
        todos: {
          ...snapB.todos,
          "1": { ...snapB.todos["1"]!, title: "Title from userB (stale)" },
        },
      }),
    ),
  );
  const winner = readTodoState(userANode.store.getState()).todos["1"]!.title;
  log("V4 overwrite", `todo 1 title after concurrent apply: "${winner}"`);
  friction.push(
    `overwrite cognition: concurrent todos map replace — winner="${winner}" (last applyLocal wins)`,
  );
  assertConvergence([userANode, userBNode, observerNode], "V4");

  // --- V5: lag + recovery ---
  log("V5", "userB lag (resetState v0); userA adds todo; full-sync");
  const obsEventsBefore = observer.appEvents.length;
  userBNode.store.resetState({
    version: 0,
    status: "active",
    data: todoStateToStore(emptyTodoState()),
  });
  friction.push("lag simulation: requires store.resetState — not OpenLessNode API");

  const t3 = userA.addTodo("Post-lag authoritative todo");
  assert.ok(t3 !== null);
  assertConvergence([userANode, userBNode, observerNode], "V5");

  log(
    "V5 recovery events",
    [
      `userB sync:complete count=${laggedSyncComplete}`,
      `observer sync:complete=${observer.syncCompletes.length}`,
      `observer sync:request=${observer.syncRequests.length}`,
      `observer new app events during recovery: ${observer.appEvents.length - obsEventsBefore}`,
    ].join("\n"),
  );
  if (observer.syncCompletes.length === 0 && laggedSyncComplete > 0) {
    friction.push(
      "recovery UX: sync:complete on lagged node only; observer sees state:update not sync:complete",
    );
  }

  // --- V6: duplicate replay ---
  log("V6", "Duplicate identical applyLocal payload");
  const beforeV6 = userANode.store.getState().version;
  const dup = todoDiff({
    metadata: readTodoState(userANode.store.getState()).metadata,
  });
  assert.ok(userANode.applyLocal(dup));
  const mid = userANode.store.getState().version;
  const dup2 = userANode.applyLocal(dup);
  const after = userANode.store.getState().version;
  log(
    "V6 idempotency",
    `first v${beforeV6}→v${mid}; duplicate ok=${dup2} v${mid}→v${after}`,
  );
  if (dup2 && after > mid) {
    friction.push(
      "ordering/idempotency: identical applyLocal still bumps version (no dedup)",
    );
  }
  assertConvergence([userANode, userBNode, observerNode], "V6 final");

  observer.dispose();

  log("FRICTION NOTES", friction.map((f) => `- ${f}`).join("\n"));
  console.log("\n=== SHARED-TODO VALIDATION COMPLETE ===");
}

main();
