import type { OpenLessNode } from "../../index";
import {
  emptyWorkspace,
  readWorkspace,
  workspaceDiff,
  type TaskItem,
  type WorkspaceData,
  type WorkspacePhase,
} from "./workspace-model";

/**
 * Planner writes: workspace phase, context, task.
 * All mutations via `node.applyLocal` only.
 */
export class PlannerClient {
  constructor(readonly node: OpenLessNode) {}

  seedWorkspace(): boolean {
    const data = emptyWorkspace();
    return this.node.applyLocal(
      workspaceDiff({
        workspace: data.workspace,
        context: data.context,
        task: data.task,
        files: data.files,
        tools: data.tools,
        artifacts: data.artifacts,
        presence: data.presence,
      }),
    );
  }

  setPhase(phase: WorkspacePhase): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        workspace: { ...w.workspace, phase },
      }),
    );
  }

  updateContext(summary: string, activeFile: string | null): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        context: {
          ...w.context,
          summary,
          activeFile,
          tokenEstimate: summary.length,
        },
      }),
    );
  }

  addTask(id: string, item: TaskItem, current?: string): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        task: {
          current: current ?? w.task.current ?? id,
          items: { ...w.task.items, [id]: item },
        },
      }),
    );
  }

  enterRecovering(checkpoint: string): boolean {
    return this.node.applyLocal({
      mutation: {
        status: "recovering",
        data: {
          recovery: { checkpoint, step: 0 },
        },
      },
      timestamp: Date.now(),
    });
  }

  recoveryStep(step: number, message: string): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal({
      mutation: {
        data: {
          recovery: {
            checkpoint: w.recovery?.checkpoint ?? "default",
            step,
          },
          "recovery.lastMessage": message,
        },
      },
      timestamp: Date.now(),
    });
  }

  finishRecovery(): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal({
      mutation: {
        status: "active",
        data: {
          recovery: w.recovery,
        },
      },
      timestamp: Date.now(),
    });
  }

  read(): WorkspaceData {
    return readWorkspace(this.node.store.getState());
  }
}

/**
 * Coder writes: files, artifacts, tools, presence.
 */
export class CoderClient {
  constructor(readonly node: OpenLessNode) {}

  addFile(id: string, path: string, contentHash: string): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        files: {
          ...w.files,
          [id]: { path, contentHash, lastEditor: this.node.nodeId },
        },
      }),
    );
  }

  addArtifact(id: string, snippet: string, kind: "log" | "patch" | "json" = "log"): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        artifacts: {
          ...w.artifacts,
          [id]: { kind, snippet },
        },
      }),
    );
  }

  recordToolRun(id: string, tool: string, outputRef: string): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        tools: {
          ...w.tools,
          [id]: { tool, status: "ok", outputRef },
        },
      }),
    );
  }

  heartbeat(focus: string): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        presence: {
          ...w.presence,
          [this.node.nodeId]: {
            actor: this.node.nodeId,
            lastSeen: Date.now(),
            focus,
          },
        },
      }),
    );
  }

  /** Intentionally illegal while recovering — for validation only. */
  illegalFileWrite(): boolean {
    const w = readWorkspace(this.node.store.getState());
    return this.node.applyLocal(
      workspaceDiff({
        files: {
          ...w.files,
          illegal: {
            path: "/tmp/forbidden",
            contentHash: "x",
            lastEditor: this.node.nodeId,
          },
        },
      }),
    );
  }

  read(): WorkspaceData {
    return readWorkspace(this.node.store.getState());
  }
}
