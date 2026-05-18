import { mesh, mkNode, diff, converged, emit } from "../_shared/probe-kit";

const probeId = "007-semantic-divergence";

function main(): void {
  const a = mkNode("writerA", { items: {}, nextId: 1 });
  const b = mkNode("writerB", { items: {}, nextId: 1 });
  const obs = mkNode("observer", { items: {}, nextId: 1 });
  mesh([a, b, obs]);

  let logicalSends = 0;
  const stale = () => ({ items: { ...((a.store.getState().data.items ?? {}) as Record<string, string>) }, nextId: a.store.getState().data.nextId as number });

  for (let i = 0; i < 5; i++) {
    logicalSends += 1;
    a.applyLocal(diff({ items: { [`solo-${i}`]: "ok" }, nextId: (stale().nextId as number) + 1 }));
    const snap = stale();
    logicalSends += 2;
    a.applyLocal(diff({ items: { ...snap.items, [`race-${i}-A`]: "A" }, nextId: (snap.nextId as number) + 1 }));
    b.applyLocal(diff({ items: { ...snap.items, [`race-${i}-B`]: "B" }, nextId: (snap.nextId as number) + 1 }));
  }

  const storeCount = Object.keys(
    (obs.store.getState().data.items ?? {}) as Record<string, string>,
  ).length;

  emit(probeId, {
    observedBehavior: `logicalSends=${logicalSends} storeKeys=${storeCount} gap=${logicalSends - storeCount}`,
    stableBehavior: "chat-thread long-run: gap 0→22 while convergence checks=0 failures",
    semanticOutcome:
      logicalSends > storeCount
        ? "Protocol-correct replica hides lost append intents"
        : "No gap this run",
    protocolOutcome: converged([a, b, obs]) ? "Checksums match across 3 replicas" : "Divergence",
  });
}

main();
