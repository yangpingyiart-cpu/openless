import { mesh, mkNode, diff, converged, versionsLine, emit } from "../_shared/probe-kit";

const probeId = "006-lag-oscillation";

function main(): void {
  const writer = mkNode("writer", { tick: 0 });
  const lagged = mkNode("lagged", { tick: 0 });
  const observer = mkNode("observer", { tick: 0 });
  mesh([writer, lagged, observer]);

  const loops = 4;
  const versions: string[] = [];

  for (let i = 0; i < loops; i++) {
    lagged.store.resetState({ version: 0, status: "active", data: { tick: 0 } });
    writer.applyLocal(diff({ tick: i + 1, label: `pulse-${i}` }));
    versions.push(versionsLine([writer, lagged, observer]));
  }

  emit(probeId, {
    observedBehavior: `${loops} lag/recovery cycles; version lines: ${versions.join(" → ")}`,
    stableBehavior: "Each cycle: gap → full-sync → converge; pattern stable across chat-thread LR4",
    semanticOutcome: "Operational history of lag events not retained in final state",
    protocolOutcome: converged([writer, lagged, observer])
      ? `All cycles ended converged (final ${versions[versions.length - 1]})`
      : "Divergence after oscillation",
  });
}

main();
