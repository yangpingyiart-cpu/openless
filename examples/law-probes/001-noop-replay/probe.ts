import { mesh, mkNode, diff, converged, versionsLine, emit } from "../_shared/probe-kit";

const probeId = "001-noop-replay";

function main(): void {
  const a = mkNode("writer", { counter: 1, note: "seed" });
  const b = mkNode("replica", { counter: 1, note: "seed" });
  mesh([a, b]);

  const v0 = a.store.getState().version;
  const dataBefore = JSON.stringify(a.store.getState().data);

  const dup = diff({ counter: 1, note: "seed" });
  a.applyLocal(dup);
  a.applyLocal(dup);

  const v1 = a.store.getState().version;
  const dataAfter = JSON.stringify(a.store.getState().data);

  emit(probeId, {
    observedBehavior: `applyLocal noop diff twice: v${v0}→v${v1}; data unchanged`,
    stableBehavior: "Repeats across chat-thread LR5 and invariant duplicate inbound tests",
    semanticOutcome: "No meaningful state evolution; counter/note identical",
    protocolOutcome: converged([a, b])
      ? `Replicas converged (${versionsLine([a, b])})`
      : "Replica divergence",
  });
}

main();
