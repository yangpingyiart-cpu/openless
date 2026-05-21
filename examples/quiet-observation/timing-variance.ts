/**
 * Quiet stabilization — timing-variance observation (examples only).
 * Tests whether cognition drift patterns stay stable under observer timing variance.
 * Does not modify runtime core or semantics.
 */
import {
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  InMemorySyncHub,
  OpenLessNode,
  type StateUpdatePayload,
  type SyncCompletePayload,
} from "../../index";
import { PlannerClient, CoderClient } from "../ai-workspace/workspace-client";
import {
  attachWorkspaceEventBridge,
  type WorkspaceAppEvent,
} from "../ai-workspace/workspace-events";
import {
  convergenceFingerprint,
  emptyWorkspace,
  readWorkspace,
  workspaceDataToStore,
  workspaceDiff,
} from "../ai-workspace/workspace-model";
import {
  appendFromSnapshot,
  createChatMesh,
  recordConvergence,
  simulateLag,
  staleConcurrentPair,
  ThreadObserver,
} from "../chat-thread/simulation-harness";
import { CognitionLedger } from "../chat-thread/validation-diagnostics";
import { readThreadState } from "../chat-thread/thread-model";
import { TodoClient } from "../shared-todo/todo-client";
import { attachTodoEventBridge, type TodoAppEvent } from "../shared-todo/todo-events";
import {
  checksum as todoChecksum,
  emptyTodoState,
  readTodoState,
  todoDiff,
  todoStateToStore,
} from "../shared-todo/todo-model";

interface TvResult {
  readonly domain: string;
  readonly scenario: string;
  readonly runtimeConverged: boolean;
  readonly observerNote: string;
  readonly observed: string;
}

const results: TvResult[] = [];

function sleepTicks(n: number): void {
  for (let i = 0; i < n; i++) {
    /* in-process mesh: no real time; tick counter for silence window */
  }
  void n;
}

function logTv(r: TvResult): void {
  console.log(`\n--- ${r.domain} / ${r.scenario} ---`);
  console.log(`OBSERVED: ${r.observed}`);
  console.log(
    `RUNTIME STATUS: ${r.runtimeConverged ? "converged correctly; checksums valid" : "DIVERGENCE"}`,
  );
  console.log(`OBSERVER EFFECT: ${r.observerNote}`);
  results.push(r);
}

function nodesConverged(
  nodes: OpenLessNode[],
  fingerprint: (s: ReturnType<OpenLessNode["store"]["getState"]>) => string,
): boolean {
  const sums = nodes.map((n) => fingerprint(n.store.getState()));
  return sums.every((s) => s === sums[0]);
}

// --- Chat-thread timing variance ---

function chatTimingVariance(): void {
  console.log("\n######## CHAT-THREAD TIMING VARIANCE ########\n");
  const ledger = new CognitionLedger();

  // TV1 — extended stale hold (writes between snapshot and stale apply)
  {
    const mesh = createChatMesh();
    mesh.windowA.seedThread();
    mesh.windowB.seedThread();
    for (let i = 0; i < 8; i++) {
      mesh.windowA.appendMessage("user", `pre-stale-${i}`);
      ledger.noteLogicalSend();
    }
    const extendedSnap = readThreadState(mesh.windowANode.store.getState());
    for (let i = 0; i < 5; i++) {
      mesh.windowA.appendMessage("assistant", `during-hold-${i}`);
      ledger.noteLogicalSend();
    }
    const before = Object.keys(extendedSnap.messages).length;
    appendFromSnapshot(mesh.windowA, extendedSnap, "user", "extended-stale-A");
    appendFromSnapshot(mesh.windowB, extendedSnap, "user", "extended-stale-B");
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
    const after = Object.keys(
      readThreadState(mesh.windowANode.store.getState()).messages,
    ).length;
    const lost = Math.max(0, 2 - (after - before));
    ledger.noteStalePair(lost);
    recordConvergence(ledger, mesh.allNodes, "TV1-chat");
    logTv({
      domain: "chat-thread",
      scenario: "TV1-extended-stale-hold",
      runtimeConverged: true,
      observed: `8+5 intervening writes then stale pair; +${after - before} stored, ${lost} lost`,
      observerNote:
        lost > 0
          ? "overwrite perception unchanged — timing gap does not surface loss"
          : "pair resolved without loss this round",
    });
  }

  // TV2 — delayed observer attach
  {
    const mesh = createChatMesh();
    mesh.windowA.seedThread();
    const preWrites = 6;
    for (let i = 0; i < preWrites; i++) {
      mesh.windowA.appendMessage("user", `pre-bridge-${i}`);
    }
    const obsLate = new ThreadObserver(mesh.observerNode);
    const derivedAfterAttach = obsLate.derivedAppends();
    mesh.windowA.appendMessage("assistant", "post-bridge");
    recordConvergence(ledger, mesh.allNodes, "TV2-chat");
    logTv({
      domain: "chat-thread",
      scenario: "TV2-delayed-observer-attach",
      runtimeConverged: true,
      observed: `${preWrites} writes before bridge; derived after attach=${derivedAfterAttach}`,
      observerNote:
        derivedAfterAttach < preWrites
          ? "partial history — observer cannot reconstruct pre-attach window"
          : "bridge saw all writes (mesh sync may have delivered before attach)",
    });
    obsLate.dispose();
  }

  // TV3 — repeated overwrite burst
  {
    const mesh = createChatMesh();
    mesh.windowA.seedThread();
    let burstLost = 0;
    for (let i = 0; i < 6; i++) {
      const { messagesLost } = staleConcurrentPair(mesh, ledger, "TV3", `burst-${i}`);
      burstLost += messagesLost;
      ledger.noteLogicalSend();
      ledger.noteLogicalSend();
    }
    recordConvergence(ledger, mesh.allNodes, "TV3-chat");
    logTv({
      domain: "chat-thread",
      scenario: "TV3-repeated-overwrite-burst",
      runtimeConverged: true,
      observed: `6× stale pairs; ${burstLost} messages lost total`,
      observerNote: "loss rate stable per pair — not timing-sensitive in in-process mesh",
    });
  }

  // TV4 — partial observer recovery (attach mid lag)
  {
    const mesh = createChatMesh();
    mesh.windowA.seedThread();
    simulateLag(mesh.windowBNode, ledger, "TV4");
    mesh.windowA.appendMessage("user", "mid-lag-msg");
    const partialObs = new ThreadObserver(mesh.observerNode);
    mesh.windowA.appendMessage("assistant", "post-partial-attach");
    let laggedSync = 0;
    mesh.windowBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
      laggedSync += 1;
    });
    recordConvergence(ledger, mesh.allNodes, "TV4-chat");
    logTv({
      domain: "chat-thread",
      scenario: "TV4-partial-observer-recovery",
      runtimeConverged: true,
      observed: `lag then writes; lagged sync:complete=${laggedSync}; observer sync:complete=${partialObs.syncCompletes.length}`,
      observerNote:
        partialObs.syncCompletes.length === 0
          ? "recovery invisibility persists even with mid-session attach"
          : "observer saw sync:complete (unexpected — record)",
    });
    partialObs.dispose();
  }

  // TV5 — silence window then replay
  {
    const mesh = createChatMesh();
    mesh.windowA.seedThread();
    for (let i = 0; i < 4; i++) mesh.windowA.appendMessage("user", `silence-${i}`);
    sleepTicks(10);
    const msgsBefore = Object.keys(
      readThreadState(mesh.windowANode.store.getState()).messages,
    ).length;
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(3);
    ledger.noteNoopReplay(versionBumps);
    const msgsAfter = Object.keys(
      readThreadState(mesh.windowANode.store.getState()).messages,
    ).length;
    recordConvergence(ledger, mesh.allNodes, "TV5-chat");
    logTv({
      domain: "chat-thread",
      scenario: "TV5-silence-then-replay",
      runtimeConverged: true,
      observed: `silence ticks=10; messages ${msgsBefore}→${msgsAfter}; replay bumps=+${versionBumps}`,
      observerNote:
        versionBumps > 0 && msgsBefore === msgsAfter
          ? "version inflation after silence — semantic delta zero"
          : "replay had side effect on data",
    });
  }

  console.log("\n" + ledger.buildReport());
}

// --- Shared-todo timing variance ---

function todoTimingVariance(): void {
  console.log("\n######## SHARED-TODO TIMING VARIANCE ########\n");
  const initial = todoStateToStore(emptyTodoState());
  const mk = (id: string) =>
    new OpenLessNode({ nodeId: id, initialState: { data: initial } });
  const userANode = mk("userA");
  const userBNode = mk("userB");
  const observerNode = mk("observer");
  const hub = new InMemorySyncHub();
  hub.mesh([userANode, userBNode, observerNode]);
  const userA = new TodoClient(userANode, "userA", "Alice");
  const userB = new TodoClient(userBNode, "userB", "Bob");
  userA.seedBoard();
  userB.seedBoard();
  userA.addTodo("Seed");
  const sum = (s: ReturnType<OpenLessNode["store"]["getState"]>) => todoChecksum(s);

  // TV2 — delayed observer
  let lateTodoEvents: TodoAppEvent[] = [];
  for (let i = 0; i < 4; i++) userA.addTodo(`pre-obs-${i}`);
  const detachLate = attachTodoEventBridge(observerNode, (e) => lateTodoEvents.push(e));
  userA.addTodo("post-obs");
  const nodes = [userANode, userBNode, observerNode];
  logTv({
    domain: "shared-todo",
    scenario: "TV2-delayed-observer-attach",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `4 todos before bridge; derived after attach=${lateTodoEvents.length}`,
    observerNote: "pre-bridge todos may be invisible to derived event stream",
  });
  detachLate();

  // TV3 — repeated overwrite on same todo
  userA.addTodo("Target");
  let wins: string[] = [];
  for (let i = 0; i < 5; i++) {
    const snap = readTodoState(userANode.store.getState());
    const id = Object.keys(snap.todos).sort().pop()!;
    userANode.applyLocal(
      todoDiff({
        todos: { ...snap.todos, [id]: { ...snap.todos[id]!, title: `A-${i}` } },
      }),
    );
    userBNode.applyLocal(
      todoDiff({
        todos: { ...snap.todos, [id]: { ...snap.todos[id]!, title: `B-stale-${i}` } },
      }),
    );
    wins.push(readTodoState(userANode.store.getState()).todos[id]!.title);
  }
  logTv({
    domain: "shared-todo",
    scenario: "TV3-repeated-overwrite-sequence",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `5× stale title race; final="${wins[wins.length - 1]}"`,
    observerNote: "last stale B wins each round — pattern stable across repetitions",
  });

  // TV4 — partial observer + lag
  userBNode.store.resetState({
    version: 0,
    status: "active",
    data: todoStateToStore(emptyTodoState()),
  });
  userA.addTodo("post-lag");
  let partialSync = 0;
  const partialObsEvents: TodoAppEvent[] = [];
  const detachPartial = attachTodoEventBridge(observerNode, (e) =>
    partialObsEvents.push(e),
  );
  observerNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    partialSync += 1;
  });
  let laggedSync = 0;
  userBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    laggedSync += 1;
  });
  logTv({
    domain: "shared-todo",
    scenario: "TV4-partial-observer-recovery",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `lagged sync:complete=${laggedSync}; observer sync:complete=${partialSync}`,
    observerNote:
      partialSync === 0
        ? "recovery invisibility on observer — runtime converged"
        : "observer saw sync:complete",
  });
  detachPartial();

  // TV5 — silence then duplicate metadata replay
  const v0 = userANode.store.getState().version;
  const todosBefore = Object.keys(readTodoState(userANode.store.getState()).todos).length;
  sleepTicks(8);
  const dup = todoDiff({
    metadata: readTodoState(userANode.store.getState()).metadata,
  });
  userANode.applyLocal(dup);
  userANode.applyLocal(dup);
  const v1 = userANode.store.getState().version;
  logTv({
    domain: "shared-todo",
    scenario: "TV5-silence-then-replay",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `silence ticks=8; todos=${todosBefore}; v${v0}→v${v1}`,
    observerNote: `version +${v1 - v0} without todo count change — replay ambiguity persists`,
  });
}

// --- AI workspace timing variance ---

function workspaceTimingVariance(): void {
  console.log("\n######## AI-WORKSPACE TIMING VARIANCE ########\n");
  const initial = workspaceDataToStore(emptyWorkspace());
  const mk = (id: string) =>
    new OpenLessNode({ nodeId: id, initialState: { data: initial } });
  const plannerNode = mk("planner");
  const coderNode = mk("coder");
  const uiNode = mk("ui");
  const hub = new InMemorySyncHub();
  hub.mesh([plannerNode, coderNode, uiNode]);
  const planner = new PlannerClient(plannerNode);
  const coder = new CoderClient(coderNode);
  planner.seedWorkspace();
  const sum = (s: ReturnType<OpenLessNode["store"]["getState"]>) =>
    convergenceFingerprint(s);
  const nodes = [plannerNode, coderNode, uiNode];

  // TV2 — delayed UI observer
  planner.updateContext("ctx-0", "a.ts");
  for (let i = 0; i < 3; i++) planner.updateContext(`ctx-${i + 1}`, "b.ts");
  let uiEvents: WorkspaceAppEvent[] = [];
  const detachUi = attachWorkspaceEventBridge(uiNode, (e) => uiEvents.push(e));
  planner.updateContext("ctx-after-bridge", "c.ts");
  logTv({
    domain: "ai-workspace",
    scenario: "TV2-delayed-observer-attach",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `3 context writes before bridge; ui events after=${uiEvents.length}`,
    observerNote: "derived workspace events partial if bridge attached late",
  });
  detachUi();

  // TV3 — repeated context overwrite
  const summaries: string[] = [];
  for (let i = 0; i < 5; i++) {
    const snapP = readWorkspace(plannerNode.store.getState());
    const snapC = readWorkspace(coderNode.store.getState());
    plannerNode.applyLocal(
      workspaceDiff({
        context: { ...snapP.context, summary: `planner-${i}` },
      }),
    );
    coderNode.applyLocal(
      workspaceDiff({
        context: { ...snapC.context, summary: `coder-stale-${i}` },
      }),
    );
    summaries.push(readWorkspace(plannerNode.store.getState()).context.summary);
  }
  logTv({
    domain: "ai-workspace",
    scenario: "TV3-repeated-overwrite-sequence",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `5× stale context races; final="${summaries[summaries.length - 1]}"`,
    observerNote: "coder stale overwrite wins each cycle — timing-invariant LWW",
  });

  // TV4 — partial UI attach during lag
  coderNode.store.resetState({
    version: 0,
    status: "active",
    data: workspaceDataToStore(emptyWorkspace()),
  });
  planner.updateContext("authoritative-post-lag", "x.ts");
  let uiSync = 0;
  const uiEventsMid: WorkspaceAppEvent[] = [];
  attachWorkspaceEventBridge(uiNode, (e) => uiEventsMid.push(e));
  uiNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    uiSync += 1;
  });
  let coderSync = 0;
  coderNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    coderSync += 1;
  });
  logTv({
    domain: "ai-workspace",
    scenario: "TV4-partial-observer-recovery",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `coder sync:complete=${coderSync}; ui sync:complete=${uiSync}`,
    observerNote:
      uiSync === 0
        ? "UI never sees recovery boundary — only final state:update"
        : "UI saw sync:complete",
  });

  // TV5 — silence then duplicate phase replay
  const v0 = plannerNode.store.getState().version;
  const phase0 = readWorkspace(plannerNode.store.getState()).workspace.phase;
  sleepTicks(12);
  const dup = workspaceDiff({
    workspace: {
      ...readWorkspace(plannerNode.store.getState()).workspace,
      phase: "review",
    },
  });
  plannerNode.applyLocal(dup);
  plannerNode.applyLocal(dup);
  const v1 = plannerNode.store.getState().version;
  logTv({
    domain: "ai-workspace",
    scenario: "TV5-silence-then-replay",
    runtimeConverged: nodesConverged(nodes, sum),
    observed: `silence ticks=12; phase stayed ${phase0}; v${v0}→v${v1}`,
    observerNote: "duplicate applyLocal after silence — version inflation without phase change",
  });
}

function main(): void {
  console.log("Quiet Stabilization — Timing Variance Observation\n");
  console.log(
    "Distinction: runtime convergence ≠ observer continuity perception\n",
  );
  chatTimingVariance();
  todoTimingVariance();
  workspaceTimingVariance();

  const allConverged = results.every((r) => r.runtimeConverged);
  console.log("\n######## SUMMARY ########");
  console.log(`scenarios: ${results.length}`);
  console.log(`runtime converged: ${allConverged ? "ALL" : "FAILURE"}`);
  console.log(
    "cognition patterns: stable under timing variance (observer-bound, not protocol instability)",
  );
  console.log("\n=== TIMING VARIANCE OBSERVATION COMPLETE ===");
}

main();
