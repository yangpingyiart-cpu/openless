import {
  InMemorySyncHub,
  OpenLessNode,
  type GlobalState,
  type StateDiff,
} from "../../../index";

export interface ProbeOutcome {
  readonly observedBehavior: string;
  readonly stableBehavior: string;
  readonly semanticOutcome: string;
  readonly protocolOutcome: string;
}

export function diff(
  data: Record<string, unknown>,
  timestamp = Date.now(),
): StateDiff {
  return { mutation: { data }, timestamp };
}

export function mesh(nodes: OpenLessNode[]): InMemorySyncHub {
  const hub = new InMemorySyncHub();
  hub.mesh(nodes);
  return hub;
}

export function mkNode(nodeId: string, data: Record<string, unknown> = { value: 0 }): OpenLessNode {
  return new OpenLessNode({
    nodeId,
    initialState: { data },
  });
}

export function checksum(state: GlobalState): string {
  return JSON.stringify({
    version: state.version,
    status: state.status,
    data: state.data,
  });
}

export function converged(nodes: OpenLessNode[]): boolean {
  const sums = nodes.map((n) => checksum(n.store.getState()));
  return sums.every((s) => s === sums[0]);
}

export function versionsLine(nodes: OpenLessNode[]): string {
  return nodes.map((n) => `${n.nodeId}=v${n.store.getState().version}`).join(" ");
}

export function emit(probeId: string, outcome: ProbeOutcome): void {
  console.log(`\n### ${probeId} — outcome ###\n`);
  console.log(`Observed Behavior:  ${outcome.observedBehavior}`);
  console.log(`Stable Behavior:    ${outcome.stableBehavior}`);
  console.log(`Semantic Outcome:   ${outcome.semanticOutcome}`);
  console.log(`Protocol Outcome:   ${outcome.protocolOutcome}`);
}
