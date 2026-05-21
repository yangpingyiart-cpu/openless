/**
 * Runtime fatigue simulation — semantic erosion pressure over time.
 * Examples only. Does not modify core. Focus: meaning stability under repeated stress.
 */
import { EVENT_SYNC_COMPLETE, type SyncCompletePayload } from "../../index";
import { CognitionLedger } from "./validation-diagnostics";
import {
  createChatMesh,
  recordConvergence,
  simulateLag,
  staleConcurrentPair,
  ThreadObserver,
} from "./simulation-harness";
import { readThreadState } from "./thread-model";

const FATIGUE_ROUNDS = 3;
const REPLAY_STORM_LOOPS = 12;
const STALE_BURST_PER_ROUND = 15;
const OBSERVER_CHURN_CYCLES = 8;
const LAG_OSCILLATION_LOOPS = 10;
const SILENCE_TICKS_PER_PHASE = 100;
const RECOVERY_ALTERNATION_CYCLES = 4;

export interface FatigueFingerprint {
  readonly round: number;
  readonly sends: number;
  readonly store: number;
  readonly gap: number;
  readonly version: number;
  readonly roundLost: number;
  readonly lossRate: number;
  readonly versionPerMessage: number;
}

export interface FatigueSummary {
  readonly rounds: FatigueFingerprint[];
  readonly convergenceFailures: number;
  readonly lossRateInvariant: boolean;
  readonly gapMonotonic: boolean;
}

function silenceTicks(n: number): void {
  void n;
}

function observerChurn(
  mesh: ReturnType<typeof createChatMesh>,
  ledger: CognitionLedger,
  round: number,
): void {
  for (let c = 0; c < OBSERVER_CHURN_CYCLES; c++) {
    mesh.windowA.appendMessage("user", `churn-r${round}-${c}`);
    ledger.noteLogicalSend();
    const obs = new ThreadObserver(mesh.observer2Node);
    ledger.record(
      "observer_attribution",
      `RF${round}-churn`,
      `cycle ${c}: derived=${obs.derivedAppends()} nodeId=observer2`,
    );
    obs.dispose();
    silenceTicks(5);
  }
}

function replayStorm(
  mesh: ReturnType<typeof createChatMesh>,
  ledger: CognitionLedger,
  round: number,
): number {
  let bumps = 0;
  for (let i = 0; i < REPLAY_STORM_LOOPS; i++) {
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(2);
    bumps += versionBumps;
    ledger.noteNoopReplay(versionBumps);
  }
  ledger.record("applylocal_opaque", `RF${round}-replay`, `storm +${bumps} version bumps`);
  return bumps;
}

function runFatigueRound(
  mesh: ReturnType<typeof createChatMesh>,
  ledger: CognitionLedger,
  obs: ThreadObserver,
  round: number,
): FatigueFingerprint {
  const tag = `RF${round}`;
  const sendsBefore = ledger.sessionTotals().logicalSends;
  const storeBefore = obs.messageCount();

  for (let i = 0; i < 10; i++) {
    mesh.windowA.appendMessage("user", `${tag}-seed-${i}`);
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, `${tag}-seed`);

  replayStorm(mesh, ledger, round);
  silenceTicks(SILENCE_TICKS_PER_PHASE);
  recordConvergence(ledger, mesh.allNodes, `${tag}-replay`);

  let roundLost = 0;
  for (let i = 0; i < STALE_BURST_PER_ROUND; i++) {
    const { messagesLost } = staleConcurrentPair(mesh, ledger, tag, `${tag}-stale-${i}`);
    roundLost += messagesLost;
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, `${tag}-stale`);

  observerChurn(mesh, ledger, round);
  recordConvergence(ledger, mesh.allNodes, `${tag}-churn`);

  let windowBSync = 0;
  const onSync = (): void => {
    windowBSync += 1;
  };
  mesh.windowBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, onSync);
  for (let i = 0; i < LAG_OSCILLATION_LOOPS; i++) {
    simulateLag(mesh.windowBNode, ledger, `${tag}-lag`);
    mesh.windowA.appendMessage("assistant", `${tag}-post-lag-${i}`);
    ledger.noteLogicalSend();
    ledger.noteLagLoop(obs.syncCompletes.length > 0);
    recordConvergence(ledger, mesh.allNodes, `${tag}-lag-${i}`);
  }
  ledger.record(
    "recovery_visibility",
    tag,
    `lag×${LAG_OSCILLATION_LOOPS}; windowB sync=${windowBSync}; observer sync=${obs.syncCompletes.length}`,
  );
  mesh.windowBNode.bus.unsubscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, onSync);

  for (let i = 0; i < RECOVERY_ALTERNATION_CYCLES; i++) {
    silenceTicks(SILENCE_TICKS_PER_PHASE);
    simulateLag(mesh.windowBNode, ledger, `${tag}-alt`);
    mesh.windowA.appendMessage("user", `${tag}-alt-${i}`);
    ledger.noteLogicalSend();
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(2);
    ledger.noteNoopReplay(versionBumps);
    recordConvergence(ledger, mesh.allNodes, `${tag}-alt-${i}`);
  }

  const t = ledger.sessionTotals();
  const store = obs.messageCount();
  const sendsDelta = t.logicalSends - sendsBefore;
  const storeDelta = store - storeBefore;
  ledger.snapshotPhase(`${tag}-final`, store, obs.derivedAppends(), mesh.windowANode.store.getState().version);

  return {
    round,
    sends: sendsDelta,
    store: storeDelta,
    gap: sendsDelta - storeDelta,
    version: mesh.windowANode.store.getState().version,
    roundLost,
    lossRate: STALE_BURST_PER_ROUND > 0 ? roundLost / STALE_BURST_PER_ROUND : 0,
    versionPerMessage: store > 0 ? mesh.windowANode.store.getState().version / store : 0,
  };
}

export function runRuntimeFatigue(): FatigueSummary {
  const ledger = new CognitionLedger();
  const mesh = createChatMesh();
  mesh.windowA.seedThread();
  mesh.windowB.seedThread();
  const obs = new ThreadObserver(mesh.observerNode);

  const rounds: FatigueFingerprint[] = [];
  for (let r = 1; r <= FATIGUE_ROUNDS; r++) {
    console.log(`\n=== FATIGUE ROUND ${r}/${FATIGUE_ROUNDS} ===\n`);
    rounds.push(runFatigueRound(mesh, ledger, obs, r));
  }

  recordConvergence(ledger, mesh.allNodes, "RF-final");
  const t = ledger.sessionTotals();

  const lossRateInvariant = rounds.every((x) => Math.abs(x.lossRate - 1) < 0.001);
  const cumulativeGaps = rounds.map((x) => x.gap);
  const gapMonotonic = cumulativeGaps.every((g, i) => i === 0 || g >= 0);

  console.log(ledger.buildReport());
  console.log("\n=== FATIGUE ROUND FINGERPRINTS (per-round delta) ===");
  for (const fp of rounds) {
    console.log(
      `R${fp.round}: Δsends=${fp.sends} Δstore=${fp.store} Δgap=${fp.gap} v=${fp.version} lossRate=${fp.lossRate.toFixed(2)}`,
    );
  }
  console.log(`\nTOTAL: sends=${t.logicalSends} store=${obs.messageCount()} gap=${t.logicalSends - obs.messageCount()}`);
  console.log(`lossRateInvariant(1.0/pair): ${lossRateInvariant}`);
  console.log(`convergenceFailures: ${t.convergenceFailures}`);

  obs.dispose();
  return {
    rounds,
    convergenceFailures: t.convergenceFailures,
    lossRateInvariant,
    gapMonotonic,
  };
}

function main(): void {
  console.log("Runtime Fatigue Simulation — chat-thread\n");
  console.log("Focus: semantic erosion pressure, NOT protocol correctness\n");
  const summary = runRuntimeFatigue();
  const stable = summary.convergenceFailures === 0 && summary.lossRateInvariant;
  console.log(
    stable
      ? "\nSEMANTIC IDENTITY: stable under fatigue (LWW loss invariant; runtime converged)"
      : "\n*** SIGNAL: fatigue run anomaly ***",
  );
  console.log("\n=== RUNTIME FATIGUE COMPLETE ===");
}

if (require.main === module) {
  main();
}
