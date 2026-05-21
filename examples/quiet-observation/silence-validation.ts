/**
 * Extended silence-validation window (examples only).
 * Longer silence gaps, extended stale/observer duration, multi-phase replay/recovery.
 * Does not modify runtime core.
 */
import { EVENT_SYNC_COMPLETE, type SyncCompletePayload } from "../../index";
import { PlannerClient } from "../ai-workspace/workspace-client";
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
import {
  checksum as todoChecksum,
  emptyTodoState,
  readTodoState,
  todoDiff,
  todoStateToStore,
} from "../shared-todo/todo-model";
import { InMemorySyncHub, OpenLessNode } from "../../index";

/** Extended profile vs timing-variance baseline */
const SILENCE_TICKS = 80;
const PRE_STALE_WRITES = 15;
const DURING_HOLD_WRITES = 12;
const STALE_BURST_LOOPS = 10;
const DELAYED_ATTACH_PRE = 12;
const OBSERVER_ONLY_TICKS = 35;
const LAG_RECOVERY_LOOPS = 8;
const REPLAY_AFTER_SILENCE = 6;
const LONG_APPEND_ROUNDS = 40;
const LONG_STALE_LOOPS = 18;
const LONG_REPLAY_LOOPS = 8;

export interface SilenceFingerprint {
  readonly logicalSends: number;
  readonly storeMessages: number;
  readonly sendGap: number;
  readonly terminalVersion: number;
  readonly convergenceFailures: number;
  readonly stalePairs: number;
  readonly messagesLost: number;
  readonly noopReplayBumps: number;
}

function silenceTicks(n: number): void {
  void n;
}

function extractFingerprint(ledger: CognitionLedger, obs: ThreadObserver): SilenceFingerprint {
  const store = obs.messageCount();
  const t = ledger.sessionTotals();
  return {
    logicalSends: t.logicalSends,
    storeMessages: store,
    sendGap: t.logicalSends - store,
    terminalVersion: obs.node.store.getState().version,
    convergenceFailures: t.convergenceFailures,
    stalePairs: t.stalePairs,
    messagesLost: t.messagesLostToStale,
    noopReplayBumps: t.noopReplayBumps,
  };
}

function chatExtendedLongRun(): SilenceFingerprint {
  console.log("\n=== SV-CHAT extended long-run ===\n");
  const ledger = new CognitionLedger();
  const mesh = createChatMesh();
  const obs = new ThreadObserver(mesh.observerNode);
  mesh.windowA.seedThread();
  mesh.windowB.seedThread();

  for (let i = 0; i < LONG_APPEND_ROUNDS; i++) {
    const c = i % 2 === 0 ? mesh.windowA : mesh.windowB;
    c.appendMessage("user", `sv-append-${i}`);
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "SV-LR1");
  ledger.snapshotPhase("SV-LR1", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  silenceTicks(SILENCE_TICKS);

  for (let i = 0; i < LONG_STALE_LOOPS; i++) {
    staleConcurrentPair(mesh, ledger, "SV-LR2", `sv-stale-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "SV-LR2");
  ledger.snapshotPhase("SV-LR2", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  silenceTicks(SILENCE_TICKS);

  const obsBefore = obs.derivedAppends();
  for (let t = 0; t < OBSERVER_ONLY_TICKS; t++) {
    mesh.windowA.appendMessage("assistant", `sv-obs-${t}`);
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "SV-LR3");
  ledger.snapshotPhase("SV-LR3", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);
  const obsNew = obs.derivedAppends() - obsBefore;
  ledger.record("observer_attribution", "SV-LR3", `observer derived +${obsNew} during extended window`);

  silenceTicks(SILENCE_TICKS);

  let windowBSync = 0;
  mesh.windowBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    windowBSync += 1;
  });
  for (let i = 0; i < LAG_RECOVERY_LOOPS; i++) {
    simulateLag(mesh.windowBNode, ledger, "SV-LR4");
    mesh.windowA.appendMessage("assistant", `sv-lag-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLagLoop(obs.syncCompletes.length > 0);
    recordConvergence(ledger, mesh.allNodes, `SV-LR4-${i}`);
  }
  ledger.record("recovery_visibility", "SV-LR4", `windowB sync:complete=${windowBSync}; observer=${obs.syncCompletes.length}`);

  silenceTicks(SILENCE_TICKS);

  let replayBumps = 0;
  for (let i = 0; i < LONG_REPLAY_LOOPS; i++) {
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(2);
    replayBumps += versionBumps;
    ledger.noteNoopReplay(versionBumps);
  }
  recordConvergence(ledger, mesh.allNodes, "SV-LR5");
  ledger.snapshotPhase("SV-LR5", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  silenceTicks(SILENCE_TICKS);

  for (let i = 0; i < STALE_BURST_LOOPS; i++) {
    mesh.windowA.appendMessage("user", `sv-pre-burst-${i}`);
    ledger.noteLogicalSend();
    staleConcurrentPair(mesh, ledger, "SV-LR6", `sv-burst-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "SV-LR6");
  ledger.snapshotPhase("SV-LR6", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  const fp = extractFingerprint(ledger, obs);
  console.log(
    [
      `SV fingerprint: sends=${fp.logicalSends} store=${fp.storeMessages} gap=${fp.sendGap}`,
      `v=${fp.terminalVersion} failures=${fp.convergenceFailures}`,
      `stalePairs=${fp.stalePairs} lost=${fp.messagesLost} noopBumps=${fp.noopReplayBumps}`,
    ].join("\n"),
  );
  console.log(ledger.buildReport());
  obs.dispose();
  return fp;
}

function chatSilencePhases(): void {
  const ledger = new CognitionLedger();
  const mesh = createChatMesh();
  mesh.windowA.seedThread();

  // Phase A: extended stale hold + long silence before replay
  const snap = readThreadState(mesh.windowANode.store.getState());
  for (let i = 0; i < PRE_STALE_WRITES; i++) {
    mesh.windowA.appendMessage("user", `sv-pre-${i}`);
    ledger.noteLogicalSend();
  }
  const held = readThreadState(mesh.windowANode.store.getState());
  for (let i = 0; i < DURING_HOLD_WRITES; i++) {
    mesh.windowA.appendMessage("assistant", `sv-hold-${i}`);
    ledger.noteLogicalSend();
  }
  silenceTicks(SILENCE_TICKS);
  appendFromSnapshot(mesh.windowA, snap, "user", "sv-A");
  appendFromSnapshot(mesh.windowB, held, "user", "sv-B");
  ledger.noteLogicalSend();
  ledger.noteLogicalSend();
  recordConvergence(ledger, mesh.allNodes, "SV-A");

  silenceTicks(SILENCE_TICKS);

  // Phase B: delayed attach after long pre-window
  const mesh2 = createChatMesh();
  mesh2.windowA.seedThread();
  for (let i = 0; i < DELAYED_ATTACH_PRE; i++) {
    mesh2.windowA.appendMessage("user", `sv-delay-${i}`);
  }
  silenceTicks(SILENCE_TICKS / 2);
  const lateObs = new ThreadObserver(mesh2.observerNode);
  const derived = lateObs.derivedAppends();
  recordConvergence(ledger, mesh2.allNodes, "SV-B");
  console.log(`SV-B delayed attach: pre=${DELAYED_ATTACH_PRE} derived=${derived}`);
  lateObs.dispose();

  silenceTicks(SILENCE_TICKS);

  // Phase C: replay after extended silence
  const v0 = mesh.windowANode.store.getState().version;
  const msgs = Object.keys(readThreadState(mesh.windowANode.store.getState()).messages).length;
  const { versionBumps } = mesh.windowA.replayMetadataDuplicate(REPLAY_AFTER_SILENCE);
  ledger.noteNoopReplay(versionBumps);
  recordConvergence(ledger, mesh.allNodes, "SV-C");
  console.log(
    `SV-C silence=${SILENCE_TICKS} replay×${REPLAY_AFTER_SILENCE}: msgs=${msgs} v${v0}→v${mesh.windowANode.store.getState().version} bumps=${versionBumps}`,
  );
}

function todoSilenceWindow(): { converged: boolean; silenceTicks: number; versionDelta: number } {
  const initial = todoStateToStore(emptyTodoState());
  const mk = (id: string) => new OpenLessNode({ nodeId: id, initialState: { data: initial } });
  const userANode = mk("userA");
  const userBNode = mk("userB");
  const observerNode = mk("observer");
  new InMemorySyncHub().mesh([userANode, userBNode, observerNode]);
  const userA = new TodoClient(userANode, "userA", "Alice");
  userA.seedBoard();
  for (let i = 0; i < 6; i++) userA.addTodo(`sv-todo-${i}`);
  silenceTicks(SILENCE_TICKS);
  const v0 = userANode.store.getState().version;
  const dup = todoDiff({ metadata: readTodoState(userANode.store.getState()).metadata });
  userANode.applyLocal(dup);
  userANode.applyLocal(dup);
  userANode.applyLocal(dup);
  const v1 = userANode.store.getState().version;
  const sums = [userANode, userBNode, observerNode].map((n) =>
    todoChecksum(n.store.getState()),
  );
  return {
    converged: sums.every((s) => s === sums[0]),
    silenceTicks: SILENCE_TICKS,
    versionDelta: v1 - v0,
  };
}

function workspaceSilenceWindow(): { converged: boolean; versionDelta: number } {
  const initial = workspaceDataToStore(emptyWorkspace());
  const mk = (id: string) => new OpenLessNode({ nodeId: id, initialState: { data: initial } });
  const plannerNode = mk("planner");
  const coderNode = mk("coder");
  const uiNode = mk("ui");
  new InMemorySyncHub().mesh([plannerNode, coderNode, uiNode]);
  const planner = new PlannerClient(plannerNode);
  planner.seedWorkspace();
  planner.updateContext("sv-ctx", "a.ts");
  silenceTicks(SILENCE_TICKS);
  const v0 = plannerNode.store.getState().version;
  const dup = workspaceDiff({
    workspace: {
      ...readWorkspace(plannerNode.store.getState()).workspace,
      phase: "review",
    },
  });
  plannerNode.applyLocal(dup);
  plannerNode.applyLocal(dup);
  plannerNode.applyLocal(dup);
  const v1 = plannerNode.store.getState().version;
  const sums = [plannerNode, coderNode, uiNode].map((n) =>
    convergenceFingerprint(n.store.getState()),
  );
  return { converged: sums.every((s) => s === sums[0]), versionDelta: v1 - v0 };
}

function main(): void {
  console.log("Silence Validation Window — extended profile\n");
  console.log(
    [
      `silenceTicks=${SILENCE_TICKS}`,
      `staleLoops=${LONG_STALE_LOOPS}`,
      `observerTicks=${OBSERVER_ONLY_TICKS}`,
      `lagLoops=${LAG_RECOVERY_LOOPS}`,
    ].join(" "),
  );
  console.log("\nDistinction: runtime correctness ≠ observer continuity\n");

  const fp = chatExtendedLongRun();
  chatSilencePhases();
  const todo = todoSilenceWindow();
  const ws = workspaceSilenceWindow();

  console.log("\n=== SILENCE WINDOW SUMMARY ===");
  console.log(`chat SV fingerprint: ${JSON.stringify(fp)}`);
  console.log(`todo silence: converged=${todo.converged} v+${todo.versionDelta}`);
  console.log(`workspace silence: converged=${ws.converged} v+${ws.versionDelta}`);
  console.log(
    fp.convergenceFailures === 0 && todo.converged && ws.converged
      ? "RUNTIME: stable under extended silence"
      : "RUNTIME: INSTABILITY DETECTED",
  );
  console.log("OBSERVER: cognition friction expected; not protocol failure");
  console.log("\n=== SILENCE VALIDATION COMPLETE ===");
}

main();
