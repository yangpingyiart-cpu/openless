/**
 * Phase 1.5 — Replicated AI Workspace State validation.
 * OpenLessNode API only. No sync internals. No core changes.
 */
import {
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  InMemorySyncHub,
  OpenLessNode,
  type StateUpdatePayload,
  type SyncCompletePayload,
  type SyncRequestPayload,
  type TransitionErrorPayload,
} from "../../index";
import { CoderClient, PlannerClient } from "./workspace-client";
import {
  attachWorkspaceEventBridge,
  type WorkspaceAppEvent,
} from "./workspace-events";
import {
  convergenceFingerprint,
  emptyWorkspace,
  readWorkspace,
  workspaceDataToStore,
  workspaceDiff,
} from "./workspace-model";

const assert = {
  ok(value: boolean, message = "expected true"): void {
    if (!value) {
      throw new Error(message);
    }
  },
  equal<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`);
    }
  },
};

function log(title: string, body: string): void {
  console.log(`\n=== ${title} ===\n${body}`);
}

function formatNode(node: OpenLessNode): string {
  const s = node.store.getState();
  const w = readWorkspace(s);
  return [
    `node=${node.nodeId} v${s.version} status=${s.status} phase=${w.workspace.phase}`,
    `  context: ${w.context.summary.slice(0, 60) || "(empty)"}`,
    `  tasks: ${Object.keys(w.task.items).length} artifacts: ${Object.keys(w.artifacts).length}`,
    `  files: ${Object.keys(w.files).length}`,
  ].join("\n");
}

/** UI observer: events + getState only — never applyLocal. */
class WorkspaceObserver {
  readonly appEvents: WorkspaceAppEvent[] = [];
  readonly runtimeStateUpdates: number[] = [];
  readonly syncRequests: SyncRequestPayload[] = [];
  readonly syncCompletes: SyncCompletePayload[] = [];
  readonly transitionErrors: TransitionErrorPayload[] = [];
  private readonly detach: () => void;

  constructor(readonly node: OpenLessNode) {
    this.detach = attachWorkspaceEventBridge(node, (e) => this.appEvents.push(e));

    node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, (p) => {
      this.runtimeStateUpdates.push(p.state.version);
    });
    node.bus.subscribe<SyncRequestPayload>(EVENT_SYNC_REQUEST, (p) => {
      this.syncRequests.push(p);
    });
    node.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, (p) => {
      this.syncCompletes.push(p);
    });
    node.bus.subscribe<TransitionErrorPayload>(EVENT_ERROR_TRANSITION, (p) => {
      this.transitionErrors.push(p);
    });
  }

  snapshot(): ReturnType<typeof readWorkspace> {
    return readWorkspace(this.node.store.getState());
  }

  dispose(): void {
    this.detach();
  }
}

function assertConvergence(
  nodes: OpenLessNode[],
  label: string,
): void {
  const fingerprints = nodes.map((n) => convergenceFingerprint(n.store.getState()));
  const ok = fingerprints.every((f) => f === fingerprints[0]);
  log(
    label,
    nodes.map(formatNode).join("\n\n") +
      `\n\nconvergence: ${ok ? "YES" : "NO"}`,
  );
  assert.ok(ok, `${label}: nodes diverged`);
}

function main(): void {
  console.log("Phase 1.5 — Replicated AI Workspace State\n");

  const initialData = workspaceDataToStore(emptyWorkspace());

  const plannerNode = new OpenLessNode({
    nodeId: "planner",
    initialState: { data: initialData },
  });
  const coderNode = new OpenLessNode({
    nodeId: "coder",
    initialState: { data: initialData },
  });
  const uiNode = new OpenLessNode({
    nodeId: "ui",
    initialState: { data: initialData },
  });

  const hub = new InMemorySyncHub();
  hub.mesh([plannerNode, coderNode, uiNode]);

  const planner = new PlannerClient(plannerNode);
  const coder = new CoderClient(coderNode);
  const ui = new WorkspaceObserver(uiNode);
  let coderSyncCompleteCount = 0;
  coderNode.bus.subscribe<SyncCompletePayload>(EVENT_SYNC_COMPLETE, () => {
    coderSyncCompleteCount += 1;
  });

  const friction: string[] = [];

  // --- V1: boot + initial sync ---
  log("V1", "Three nodes mesh; planner seeds workspace");
  assert.ok(planner.seedWorkspace());
  assertConvergence([plannerNode, coderNode, uiNode], "V1 after seed");

  // --- V2: planner context/task; coder artifacts/files ---
  log("V2", "Planner updates context/task; coder writes files & artifacts");
  assert.ok(planner.setPhase("planning"));
  assert.ok(
    planner.updateContext(
      "Implement workspace validation example",
      "examples/ai-workspace/run.ts",
    ),
  );
  assert.ok(
    planner.addTask("t1", {
      title: "Wire planner → coder handoff",
      owner: "planner",
      status: "open",
    }),
  );
  assert.ok(planner.setPhase("coding"));
  assert.ok(coder.addFile("f1", "examples/ai-workspace/run.ts", "hash-run-v1"));
  assert.ok(
    coder.addArtifact("a1", "export function main() { ... }", "patch"),
  );
  assert.ok(coder.recordToolRun("tool1", "ts-node", "a1"));
  assert.ok(coder.heartbeat("run.ts"));
  assertConvergence([plannerNode, coderNode, uiNode], "V2 after relay");

  // --- V3: UI observer only ---
  log("V3", "UI observer (events + getState only)");
  const phaseEvents = ui.appEvents.filter((e) => e.type === "workspace:phase-changed");
  const artifactEvents = ui.appEvents.filter((e) => e.type === "workspace:artifact-added");
  const uiView = ui.snapshot();

  log(
    "V3 observer",
    [
      `app events: ${ui.appEvents.length} (phase=${phaseEvents.length}, artifacts=${artifactEvents.length})`,
      `runtime state:update versions seen: ${ui.runtimeStateUpdates.join(",")}`,
      `sync:request=${ui.syncRequests.length} sync:complete=${ui.syncCompletes.length}`,
      `read snapshot phase=${uiView.workspace.phase} artifacts=${Object.keys(uiView.artifacts).length}`,
    ].join("\n"),
  );

  assert.ok(ui.appEvents.length > 0, "UI should receive derived app events");
  assert.ok(phaseEvents.length > 0, "UI should see phase-changed");
  assert.ok(artifactEvents.length > 0, "UI should see artifact-added");
  assert.ok(ui.runtimeStateUpdates.length > 0, "UI should see state:update");
  assert.equal(uiView.workspace.phase, "coding");

  friction.push(
    "observer ergonomics: derived app events use observer nodeId (ui), not writer (planner/coder)",
  );

  // --- V4: lag + full-sync recovery ---
  log("V4", "Coder lag (store.resetState) → planner writes → full-sync");
  const uiEventsBeforeLag = ui.appEvents.length;
  coderNode.store.resetState({
    version: 0,
    status: "active",
    data: workspaceDataToStore(emptyWorkspace()),
  });
  friction.push("lag simulation requires store.resetState — not an OpenLessNode API");

  assert.ok(
    planner.updateContext(
      "Post-lag planner context (authoritative)",
      "examples/ai-workspace/run.ts",
    ),
  );
  assertConvergence([plannerNode, coderNode, uiNode], "V4 after full-sync");

  assert.ok(coderSyncCompleteCount > 0, "lagged node should emit sync:complete");
  if (ui.syncCompletes.length === 0) {
    friction.push(
      "observer ergonomics: UI replica saw state:update but not sync:complete (event is on lagged peer only)",
    );
  }
  if (ui.appEvents.length > uiEventsBeforeLag) {
    /* observer kept working */
  }

  // Recovery rules on coder (recovering + legal/illegal writes)
  log("V4b", "Coder recovering: illegal files write, legal recovery.* step");
  const coderAsPlanner = new PlannerClient(coderNode);
  assert.ok(coderAsPlanner.enterRecovering("checkpoint-alpha"));
  const illegal = coder.illegalFileWrite();
  assert.ok(!illegal, "files write should fail while recovering");
  assert.ok(coderAsPlanner.recoveryStep(1, "replaying tool outputs"));
  assert.ok(coderAsPlanner.finishRecovery());
  assertConvergence([plannerNode, coderNode, uiNode], "V4b after recovery exit");

  if (ui.transitionErrors.length === 0 && !illegal) {
    friction.push("error:transition on UI node not observed for coder illegal write (may fire only on coder bus)");
  }

  // --- V5: concurrent applyLocal (context stomp) ---
  log("V5", "Concurrent context overwrite (stale read)");
  const plannerSnap = readWorkspace(plannerNode.store.getState());
  const coderSnap = readWorkspace(coderNode.store.getState());

  assert.ok(
    plannerNode.applyLocal(
      workspaceDiff({
        context: {
          ...plannerSnap.context,
          summary: "planner-wins?",
        },
      }),
    ),
  );
  assert.ok(
    coderNode.applyLocal(
      workspaceDiff({
        context: {
          ...coderSnap.context,
          summary: "coder-stale-overwrite",
        },
      }),
    ),
  );

  const afterConcurrent = readWorkspace(plannerNode.store.getState()).context.summary;
  log("V5 result", `context.summary = "${afterConcurrent}"`);
  friction.push(
    `concurrent overwrite: last applyLocal wins on top-level context (got: "${afterConcurrent}") — no merge`,
  );
  assertConvergence([plannerNode, coderNode, uiNode], "V5 after concurrent writes");

  // --- V6: duplicate applyLocal payload ---
  log("V6", "Duplicate identical applyLocal on planner");
  const beforeV6 = plannerNode.store.getState().version;
  const dupDiff = workspaceDiff({
    workspace: {
      ...readWorkspace(plannerNode.store.getState()).workspace,
      phase: "review",
    },
  });
  assert.ok(plannerNode.applyLocal(dupDiff));
  const midVersion = plannerNode.store.getState().version;
  const dupAgain = plannerNode.applyLocal(dupDiff);
  const afterV6 = plannerNode.store.getState().version;

  log(
    "V6 result",
    [
      `first apply: v${beforeV6}→v${midVersion}`,
      `duplicate apply returned ${dupAgain}, v${midVersion}→v${afterV6}`,
      `phase=${readWorkspace(plannerNode.store.getState()).workspace.phase}`,
    ].join("\n"),
  );

  if (dupAgain && afterV6 > midVersion) {
    friction.push(
      "idempotency: identical applyLocal still advances version (no op dedup)",
    );
  }

  assertConvergence([plannerNode, coderNode, uiNode], "V6 final");

  ui.dispose();

  log("FRICTION NOTES (for PHASE_1_5_AI_WORKSPACE_VALIDATION.md)", friction.join("\n- "));

  console.log("\n=== VALIDATION RUN COMPLETE ===");
}

main();
