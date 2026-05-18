import { mesh, mkNode, diff, converged, emit } from "../_shared/probe-kit";

const probeId = "005-version-inflation";

function main(): void {
  const a = mkNode("writer", { messages: { "1": "only" }, nextId: 2 });
  const b = mkNode("replica", { messages: { "1": "only" }, nextId: 2 });
  mesh([a, b]);

  const msgCountBefore = Object.keys(
    (a.store.getState().data.messages ?? {}) as Record<string, string>,
  ).length;
  const v0 = a.store.getState().version;

  for (let i = 0; i < 10; i++) {
    a.applyLocal(diff({ messages: { "1": "only" }, nextId: 2 }));
  }

  const v1 = a.store.getState().version;
  const msgCountAfter = Object.keys(
    (a.store.getState().data.messages ?? {}) as Record<string, string>,
  ).length;

  emit(probeId, {
    observedBehavior: `10 noop metadata writes: v${v0}→v${v1}; messages ${msgCountBefore}→${msgCountAfter}`,
    stableBehavior: "chat-thread LR5: +16 version bumps with unchanged message count",
    semanticOutcome: `Version delta ${v1 - v0} with semantic delta ${msgCountAfter - msgCountBefore}`,
    protocolOutcome: converged([a, b]) ? "Replicas remain equal" : "Divergence",
  });
}

main();
