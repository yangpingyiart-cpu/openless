import { EventBus } from "../core/event-bus";
import { GlobalState, StateStore } from "../core/state-store";
import {
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  StateUpdatePayload,
  TransitionEngine,
  TransitionErrorPayload,
} from "../core/transition-engine";

function formatData(data: Record<string, unknown>): string {
  return JSON.stringify(data, null, 2);
}

function logStateUpdate(payload: StateUpdatePayload): void {
  const { state } = payload;
  console.log(`
[STATE UPDATED]
version: ${state.version}
status: ${state.status}
data:
${formatData(state.data)}
`);
}

function logTransitionError(payload: TransitionErrorPayload): void {
  console.log(`
[TRANSITION ERROR]
rule: ${payload.rule ?? "validation"}
reason: ${payload.reason}
current version: ${payload.state.version}
current status: ${payload.state.status}
`);
}

function logFinalState(state: GlobalState): void {
  console.log(`
FINAL STATE
version: ${state.version}
status: ${state.status}
data:
${formatData(state.data)}
`);
}

function main(): void {
  console.log("=== OpenLess Runtime Demo ===\n");

  const bus = new EventBus();
  const store = new StateStore({ status: "recovering" });
  const engine = new TransitionEngine(store, bus);

  bus.subscribe(EVENT_STATE_UPDATE, logStateUpdate);
  bus.subscribe(EVENT_ERROR_TRANSITION, logTransitionError);

  const diffs = [
    {
      label: "Diff 1 — legal recovery mutation",
      diff: {
        mutation: {
          data: {
            "recovery.step": 1,
            "recovery.message": "Replaying checkpoint",
          },
        },
        timestamp: Date.now(),
      },
    },
    {
      label: "Diff 2 — illegal recovery mutation (non-recovery data key)",
      diff: {
        mutation: {
          data: {
            userId: "user-42",
          },
        },
        timestamp: Date.now(),
      },
    },
    {
      label: "Diff 3 — recovery complete",
      diff: {
        mutation: {
          status: "active" as const,
          data: {
            "recovery.message": "Recovery finished",
          },
        },
        timestamp: Date.now(),
      },
    },
  ];

  for (const { label, diff } of diffs) {
    console.log(`--- ${label} ---`);
    const ok = engine.applyTransition(diff);
    console.log(`applyTransition: ${ok ? "accepted" : "rejected"}\n`);
  }

  logFinalState(store.getState());
}

main();
