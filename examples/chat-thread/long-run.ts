/**
 * Phase 1.5 — Chat thread LONG-RUNNING usage simulation.
 * Focus: cognition pressure accumulation, not runtime correctness.
 */
import { EVENT_SYNC_COMPLETE, type SyncCompletePayload } from "../../index";
import { CognitionLedger } from "./validation-diagnostics";
import {
  createChatMesh,
  logSection,
  recordConvergence,
  simulateLag,
  staleConcurrentPair,
  ThreadObserver,
  versionsLine,
} from "./simulation-harness";

const APPEND_SESSION_ROUNDS = 40;
const STALE_READ_LOOPS = 12;
const LAG_RECOVERY_LOOPS = 6;
const REPLAY_LOOPS = 8;
const CONCURRENT_APPEND_LOOPS = 10;
const OBSERVER_ONLY_TICKS = 20;

function main(): void {
  console.log("Phase 1.5 — Chat Thread LONG-RUN Validation\n");
  const ledger = new CognitionLedger();
  const mesh = createChatMesh();
  const obs1 = new ThreadObserver(mesh.observerNode);
  const obs2 = new ThreadObserver(mesh.observer2Node);

  mesh.windowA.seedThread();
  mesh.windowB.seedThread();

  // LR1 — long-running append session (alternating writers, fresh reads)
  logSection("LR1", `Long append session (${APPEND_SESSION_ROUNDS} rounds)`);
  for (let i = 0; i < APPEND_SESSION_ROUNDS; i++) {
    const client = i % 2 === 0 ? mesh.windowA : mesh.windowB;
    const id = client.appendMessage("user", `session-msg-${i}`);
    if (id !== null) ledger.noteLogicalSend();
    if (i % 5 === 0) client.setTyping(i % 10 < 5);
  }
  recordConvergence(ledger, mesh.allNodes, "LR1");
  ledger.snapshotPhase(
    "LR1",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );
  logSection(
    "LR1 metrics",
    [
      versionsLine(mesh.allNodes),
      `store messages: ${obs1.messageCount()}`,
      `observer derived appends: ${obs1.derivedAppends()}`,
      `logical sends: ${APPEND_SESSION_ROUNDS}`,
    ].join("\n"),
  );
  ledger.record(
    "full_map_rewrite",
    "LR1",
    `${APPEND_SESSION_ROUNDS} appends each replaced whole messages map`,
  );
  ledger.record(
    "version_ordering",
    "LR1",
    `version=${mesh.windowANode.store.getState().version} for ${obs1.messageCount()} messages`,
  );

  // LR2 — repeated stale-read concurrent append loops
  logSection("LR2", `Stale-read loops (${STALE_READ_LOOPS}×)`);
  let staleLostTotal = 0;
  for (let i = 0; i < STALE_READ_LOOPS; i++) {
    const { messagesLost } = staleConcurrentPair(
      mesh,
      ledger,
      "LR2",
      `stale-${i}`,
    );
    staleLostTotal += messagesLost;
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "LR2");
  ledger.snapshotPhase(
    "LR2",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );
  logSection(
    "LR2 metrics",
    [
      `stale pairs: ${STALE_READ_LOOPS}`,
      `messages lost to stale: ${staleLostTotal}`,
      `store messages: ${obs1.messageCount()}`,
      `send gap will grow if logical sends counted stale attempts`,
    ].join("\n"),
  );

  // LR3 — observer-only windows (no applyLocal on observers)
  logSection("LR3", `Observer-only ticks (${OBSERVER_ONLY_TICKS})`);
  const obs1Before = obs1.derivedAppends();
  const obs2Before = obs2.derivedAppends();
  for (let t = 0; t < OBSERVER_ONLY_TICKS; t++) {
    mesh.windowA.appendMessage("assistant", `observer-tick-${t}`);
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "LR3");
  const obs1New = obs1.derivedAppends() - obs1Before;
  const obs2New = obs2.derivedAppends() - obs2Before;
  ledger.record(
    "observer_attribution",
    "LR3",
    `obs1 +${obs1New} obs2 +${obs2New} events; nodeId always observer*`,
  );
  ledger.record(
    "semantic_collapse",
    "LR3",
    "observers cannot distinguish local vs inbound without diff parse",
  );
  if (obs1New !== obs2New) {
    ledger.record(
      "observer_attribution",
      "LR3",
      "two observers derived different counts — bridge timing",
    );
  }
  logSection(
    "LR3 metrics",
    [
      `obs1 events: ${obs1.derivedAppends()} (new ${obs1New})`,
      `obs2 events: ${obs2.derivedAppends()} (new ${obs2New})`,
      `store messages: ${obs1.messageCount()}`,
      `obs1 runtime updates: ${obs1.runtimeUpdates.length}`,
    ].join("\n"),
  );
  ledger.snapshotPhase(
    "LR3",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );

  // LR4 — lag / recovery loops
  logSection("LR4", `Lag/recovery loops (${LAG_RECOVERY_LOOPS}×)`);
  let windowBSyncComplete = 0;
  mesh.windowBNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    windowBSyncComplete += 1;
  });
  for (let i = 0; i < LAG_RECOVERY_LOOPS; i++) {
    simulateLag(mesh.windowBNode, ledger, "LR4");
    const id = mesh.windowA.appendMessage("assistant", `post-lag-${i}`);
    if (id !== null) ledger.noteLogicalSend();
    const observerSaw = obs1.syncCompletes.length > 0;
    ledger.noteLagLoop(observerSaw);
    recordConvergence(ledger, mesh.allNodes, `LR4-${i}`);
  }
  ledger.record(
    "recovery_visibility",
    "LR4",
    `windowB sync:complete total=${windowBSyncComplete}; observer=${obs1.syncCompletes.length}`,
  );
  ledger.snapshotPhase(
    "LR4",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );
  logSection(
    "LR4 metrics",
    [
      `lag loops: ${LAG_RECOVERY_LOOPS}`,
      `windowB sync:complete: ${windowBSyncComplete}`,
      `observer sync:complete: ${obs1.syncCompletes.length}`,
    ].join("\n"),
  );

  // LR5 — repeated duplicate replay
  logSection("LR5", `Repeated replay (${REPLAY_LOOPS}× duplicate metadata)`);
  let replayBumps = 0;
  for (let i = 0; i < REPLAY_LOOPS; i++) {
    const { versionBumps } = mesh.windowA.replayMetadataDuplicate(2);
    replayBumps += versionBumps;
    ledger.record("applylocal_opaque", "LR5", `dup batch ${i}: +${versionBumps} v`);
  }
  ledger.noteNoopReplay(replayBumps);
  recordConvergence(ledger, mesh.allNodes, "LR5");
  ledger.snapshotPhase(
    "LR5",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );
  logSection("LR5 metrics", `noop replay version bumps: ${replayBumps}`);

  // LR6 — concurrent append loops (fresh stale each iteration)
  logSection("LR6", `Concurrent append loops (${CONCURRENT_APPEND_LOOPS}×)`);
  let loopLost = 0;
  for (let i = 0; i < CONCURRENT_APPEND_LOOPS; i++) {
    mesh.windowA.appendMessage("user", `pre-burst-${i}`);
    ledger.noteLogicalSend();
    const { messagesLost } = staleConcurrentPair(
      mesh,
      ledger,
      "LR6",
      `burst-${i}`,
    );
    loopLost += messagesLost;
    ledger.noteLogicalSend();
    ledger.noteLogicalSend();
  }
  recordConvergence(ledger, mesh.allNodes, "LR6");
  ledger.snapshotPhase(
    "LR6",
    obs1.messageCount(),
    obs1.derivedAppends(),
    mesh.windowANode.store.getState().version,
  );
  logSection(
    "LR6 metrics",
    [
      `concurrent loops: ${CONCURRENT_APPEND_LOOPS}`,
      `messages lost in loops: ${loopLost}`,
      `final store count: ${obs1.messageCount()}`,
    ].join("\n"),
  );

  obs1.dispose();
  obs2.dispose();

  console.log("\n" + ledger.buildReport());

  logSection(
    "COGNITION SUMMARY",
    [
      "REPEATING (expect on every multi-writer chat session):",
      "  overwrite_lww, full_map_rewrite, version_ordering, observer_attribution",
      "",
      "ACCUMULATING (gap grows over long session):",
      "  sent_vs_store_gap — logical sends exceed store count after stale loops",
      "  recovery_visibility — observer never learns 'sync done' across lag loops",
      "",
      "ONE_SHOT (learn once, then background):",
      "  lag_reset_store API discovery, applylocal_opaque boolean",
      "",
      "Runtime correctness: all convergence checks should pass.",
      "Confusion is semantic: silent loss, version-as-order, wrong event actor.",
    ].join("\n"),
  );

  console.log("\n=== CHAT-THREAD LONG-RUN COMPLETE ===");
}

main();
