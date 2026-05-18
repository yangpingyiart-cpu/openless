import { mesh, mkNode, diff, converged, emit } from "../_shared/probe-kit";

const probeId = "003-replay-ambiguity";

function main(): void {
  const a = mkNode("writer", { phase: "draft", revision: 1 });
  const b = mkNode("replica", { phase: "draft", revision: 1 });
  mesh([a, b]);

  const steps: string[] = [];
  const record = (label: string) => {
    const s = a.store.getState();
    steps.push(`${label}: v${s.version} phase=${s.data.phase}`);
  };

  record("start");
  a.applyLocal(diff({ phase: "review", revision: 2 }));
  record("after write");
  a.applyLocal(diff({ phase: "review", revision: 2 }));
  record("after duplicate applyLocal");
  b.applyLocal(diff({ phase: "review", revision: 2 }));
  record("after replica replay same payload");

  emit(probeId, {
    observedBehavior: `Version trail: ${steps.join(" | ")}`,
    stableBehavior: "Deterministic replay reproduces same final state; trail is version-only",
    semanticOutcome: "Cannot distinguish first apply vs retry vs inbound from version alone",
    protocolOutcome: converged([a, b]) ? "Final states equal" : "Divergence",
  });
}

main();
