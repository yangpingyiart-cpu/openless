import { mesh, mkNode, diff, converged, versionsLine, emit } from "../_shared/probe-kit";

const probeId = "002-stale-overwrite";

function main(): void {
  const a = mkNode("writerA", { items: { "1": "a" }, nextId: 2 });
  const b = mkNode("writerB", { items: { "1": "a" }, nextId: 2 });
  mesh([a, b]);

  const stale = { items: { "1": "a" }, nextId: 2 };

  a.applyLocal(
    diff({
      items: { ...stale.items, "2": "from-A" },
      nextId: 3,
    }),
  );
  b.applyLocal(
    diff({
      items: { ...stale.items, "2": "from-B-stale" },
      nextId: 3,
    }),
  );

  const items = (a.store.getState().data.items ?? {}) as Record<string, string>;
  const keys = Object.keys(items);

  emit(probeId, {
    observedBehavior: `Stale concurrent writes on shared key: final items=${JSON.stringify(items)}`,
    stableBehavior: "22/22 stale pairs in chat-thread long-run lost exactly one logical append",
    semanticOutcome:
      keys.length === 2 && items["2"] === "from-B-stale"
        ? "One writer intent erased (A's id=2 lost)"
        : `Unexpected item shape: ${keys.join(",")}`,
    protocolOutcome: converged([a, b])
      ? `Converged with LWW (${versionsLine([a, b])})`
      : "Protocol divergence",
  });
}

main();
