/**
 * Phase 1.5 — shared todo validation (OpenLessNode API only).
 *
 * Two collaborators on a replicated todo board. No sync internals.
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
import {
  addTodo,
  boardDiff,
  emptyBoard,
  readBoard,
  toggleTodo,
} from "./todo-model";

function log(title: string, body: string): void {
  console.log(`\n--- ${title} ---\n${body}`);
}

function formatBoard(node: OpenLessNode): string {
  const { version, status } = node.store.getState();
  const board = readBoard(node.store.getState());
  const lines = Object.entries(board.todos).map(
    ([id, t]) => `  [${id}] ${t.done ? "x" : " "} ${t.title}`,
  );
  return (
    `node=${node.nodeId} v${version} status=${status}\n` +
    (lines.length ? lines.join("\n") : "  (empty)")
  );
}

/** App façade: only `OpenLessNode.applyLocal` for writes. */
class SharedTodoClient {
  constructor(readonly node: OpenLessNode) {}

  add(title: string): boolean {
    const next = addTodo(readBoard(this.node.store.getState()), title);
    return this.node.applyLocal(boardDiff(next));
  }

  toggle(id: string): boolean {
    const next = toggleTodo(readBoard(this.node.store.getState()), id);
    if (!next) {
      return false;
    }
    return this.node.applyLocal(boardDiff(next));
  }

  board(): ReturnType<typeof readBoard> {
    return readBoard(this.node.store.getState());
  }
}

function wireLogging(node: OpenLessNode): void {
  node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, (p) => {
    const board = readBoard(p.state);
    const keys = Object.keys(board.todos);
    console.log(
      `[${node.nodeId}] state:update v${p.state.version} todos=${keys.length}`,
    );
  });

  node.bus.subscribe<TransitionErrorPayload>(EVENT_ERROR_TRANSITION, (p) => {
    console.log(
      `[${node.nodeId}] error:transition ${p.rule ?? "validation"}: ${p.reason}`,
    );
  });

  node.bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
    console.log(
      `[${node.nodeId}] sync:request local=v${p.localVersion} incoming=v${p.incomingVersion} from=${p.fromPeerId}`,
    );
  });

  node.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
    console.log(
      `[${node.nodeId}] sync:complete v${p.state.version} from=${p.fromPeerId}`,
    );
  });
}

function main(): void {
  console.log("=== Phase 1.5: Shared Todo (OpenLessNode only) ===\n");

  const aliceNode = new OpenLessNode({
    nodeId: "alice",
    initialState: { data: emptyBoard() as unknown as Record<string, unknown> },
  });
  const bobNode = new OpenLessNode({
    nodeId: "bob",
    initialState: { data: emptyBoard() as unknown as Record<string, unknown> },
  });

  const hub = new InMemorySyncHub();
  hub.link(aliceNode, bobNode);

  wireLogging(aliceNode);
  wireLogging(bobNode);

  const alice = new SharedTodoClient(aliceNode);
  const bob = new SharedTodoClient(bobNode);

  log("1", "Alice adds two todos");
  assert.ok(alice.add("Buy milk"));
  assert.ok(alice.add("Write validation notes"));

  log("Alice", formatBoard(aliceNode));
  log("Bob (replica)", formatBoard(bobNode));

  log("2", "Bob toggles todo 1");
  assert.ok(bob.toggle("1"));

  log("Alice", formatBoard(aliceNode));
  log("Bob", formatBoard(bobNode));

  log("3", "Simulate Bob lag → gap → full-sync");
  bobNode.store.resetState({
    version: 0,
    status: "active",
    data: emptyBoard() as unknown as Record<string, unknown>,
  });
  console.log(`Bob reset: v${bobNode.store.getState().version}`);

  assert.ok(alice.add("Phase 1.5 checkpoint"));
  log("Alice after solo edit while Bob lagged", formatBoard(aliceNode));
  log("Bob after catch-up", formatBoard(bobNode));

  const a = aliceNode.store.getState();
  const b = bobNode.store.getState();
  const converged =
    a.version === b.version &&
    JSON.stringify(readBoard(a).todos) === JSON.stringify(readBoard(b).todos);

  console.log(`\n=== convergence: ${converged ? "YES" : "NO"} ===`);
  if (!converged) {
    process.exitCode = 1;
  }
}

/** Minimal assert without pulling test runner into example. */
const assert = {
  ok(value: boolean, message = "expected true"): void {
    if (!value) {
      throw new Error(message);
    }
  },
};

main();
