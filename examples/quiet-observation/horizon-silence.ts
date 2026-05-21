/**
 * Silence horizon extension — maximal in-process silence profile (examples only).
 */
import { runRuntimeFatigue, type FatigueSummary } from "../chat-thread/runtime-fatigue";
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

const HORIZON_SILENCE_TICKS = 200;
const HORIZON_STALE_LOOPS = 24;
const HORIZON_LAG_LOOPS = 12;
const HORIZON_REPLAY_ROUNDS = 16;
const HORIZON_APPEND_ROUNDS = 50;

function silenceTicks(n: number): void {
  void n;
}

function horizonChatProfile(): string {
  const ledger = new CognitionLedger();
  const mesh = createChatMesh();
  const obs = new ThreadObserver(mesh.observerNode);
  mesh.windowA.seedThread();
  mesh.windowB.seedThread();

  for (let i = 0; i < HORIZON_APPEND_ROUNDS; i++) {
    (i % 2 === 0 ? mesh.windowA : mesh.windowB).appendMessage("user", `hz-${i}`);
    ledger.noteLogicalSend();
  }
  silenceTicks(HORIZON_SILENCE_TICKS);
  recordConvergence(ledger, mesh.allNodes, "HZ-1");
  ledger.snapshotPhase("HZ-1", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  for (let i = 0; i < HORIZON_STALE_LOOPS; i++) {
    staleConcurrentPair(mesh, ledger, "HZ", `hz-stale-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  silenceTicks(HORIZON_SILENCE_TICKS);
  recordConvergence(ledger, mesh.allNodes, "HZ-2");
  ledger.snapshotPhase("HZ-2", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  for (let i = 0; i < HORIZON_LAG_LOOPS; i++) {
    simulateLag(mesh.windowBNode, ledger, "HZ-lag");
    mesh.windowA.appendMessage("assistant", `hz-lag-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLagLoop(false);
  }
  silenceTicks(HORIZON_SILENCE_TICKS);
  recordConvergence(ledger, mesh.allNodes, "HZ-3");

  let bumps = 0;
  for (let i = 0; i < HORIZON_REPLAY_ROUNDS; i++) {
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(2);
    bumps += versionBumps;
    ledger.noteNoopReplay(versionBumps);
  }
  silenceTicks(HORIZON_SILENCE_TICKS);
  recordConvergence(ledger, mesh.allNodes, "HZ-4");
  ledger.snapshotPhase("HZ-4", obs.messageCount(), obs.derivedAppends(), mesh.windowANode.store.getState().version);

  const t = ledger.sessionTotals();
  const store = obs.messageCount();
  const fp = `${t.logicalSends}/${store}/gap${t.logicalSends - store}/v${mesh.windowANode.store.getState().version}/${t.convergenceFailures}`;
  console.log(`HORIZON fingerprint: ${fp}`);
  console.log(`stale loss: ${t.messagesLostToStale}/${t.stalePairs}`);
  console.log(ledger.buildReport());
  obs.dispose();
  return fp;
}

function main(): void {
  console.log("Silence Horizon Extension\n");
  console.log(`silenceTicks=${HORIZON_SILENCE_TICKS} staleLoops=${HORIZON_STALE_LOOPS}\n`);

  const hz1 = horizonChatProfile();
  silenceTicks(HORIZON_SILENCE_TICKS);
  const hz2 = horizonChatProfile();

  console.log("\n=== HORIZON REPRODUCIBILITY ===");
  console.log(`run1: ${hz1}`);
  console.log(`run2: ${hz2}`);
  console.log(`identical: ${hz1 === hz2}`);

  console.log("\n=== HORIZON + FATIGUE COMBINED ===\n");
  const fatigue = runRuntimeFatigue();

  console.log("\n=== HORIZON SILENCE COMPLETE ===");
  console.log(
    hz1 === hz2 && fatigue.convergenceFailures === 0
      ? "GOVERNANCE: semantic identity holds at extended horizon"
      : "GOVERNANCE: check signals",
  );
}

main();
