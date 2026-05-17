import { InMemorySyncHub } from "../core/delta-syncer";
import {
  OpenLessNode,
  OpenLessNodeOptions,
} from "../core/openless-node";
import { GlobalState, StateDiff } from "../core/state-store";

export function statesEqual(a: GlobalState, b: GlobalState): boolean {
  return (
    a.version === b.version &&
    a.status === b.status &&
    JSON.stringify(a.data) === JSON.stringify(b.data)
  );
}

export function createNode(
  options: OpenLessNodeOptions,
): OpenLessNode {
  return new OpenLessNode(options);
}

export interface LinkedNodes {
  a: OpenLessNode;
  b: OpenLessNode;
  hub: InMemorySyncHub;
}

export function createLinkedNodes(
  idA = "node-a",
  idB = "node-b",
  optionsA?: Omit<OpenLessNodeOptions, "nodeId">,
  optionsB?: Omit<OpenLessNodeOptions, "nodeId">,
): LinkedNodes {
  const a = new OpenLessNode({ nodeId: idA, ...optionsA });
  const b = new OpenLessNode({ nodeId: idB, ...optionsB });
  const hub = new InMemorySyncHub();
  hub.link(a, b);
  return { a, b, hub };
}

export function counterDiff(value: number, timestamp = Date.now()): StateDiff {
  return {
    mutation: { data: { counter: value } },
    timestamp,
  };
}
