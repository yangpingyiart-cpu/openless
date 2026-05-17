import type { GlobalState, StateDiff } from "../../core/state-store";

export type WorkspacePhase =
  | "idle"
  | "planning"
  | "coding"
  | "review"
  | "done";

export interface WorkspaceMeta {
  readonly id: string;
  readonly title: string;
  readonly phase: WorkspacePhase;
}

export interface WorkspaceContext {
  readonly summary: string;
  readonly activeFile: string | null;
  readonly tokenEstimate?: number;
}

export interface TaskItem {
  readonly title: string;
  readonly owner: "planner" | "coder" | "human";
  readonly status: "open" | "running" | "done";
}

export interface FileEntry {
  readonly path: string;
  readonly contentHash: string;
  readonly lastEditor: string;
}

export interface ToolRun {
  readonly tool: string;
  readonly status: "pending" | "ok" | "error";
  readonly outputRef: string;
}

export interface Artifact {
  readonly kind: "log" | "patch" | "json";
  readonly snippet: string;
}

export interface Presence {
  readonly actor: string;
  readonly lastSeen: number;
  readonly focus?: string;
}

export interface RecoveryState {
  readonly checkpoint: string;
  readonly step: number;
}

/** Application view of `GlobalState.data`. */
export interface WorkspaceData {
  readonly workspace: WorkspaceMeta;
  readonly context: WorkspaceContext;
  readonly task: {
    readonly current: string | null;
    readonly items: Record<string, TaskItem>;
  };
  readonly files: Record<string, FileEntry>;
  readonly tools: Record<string, ToolRun>;
  readonly artifacts: Record<string, Artifact>;
  readonly presence: Record<string, Presence>;
  readonly recovery?: RecoveryState;
}

export function emptyWorkspace(workspaceId = "ws-ai-1"): WorkspaceData {
  return {
    workspace: {
      id: workspaceId,
      title: "Replicated AI Workspace",
      phase: "idle",
    },
    context: {
      summary: "",
      activeFile: null,
    },
    task: { current: null, items: {} },
    files: {},
    tools: {},
    artifacts: {},
    presence: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function readWorkspace(state: GlobalState): WorkspaceData {
  const raw = state.data;
  const workspaceRaw = asRecord(raw.workspace);
  const contextRaw = asRecord(raw.context);
  const taskRaw = asRecord(raw.task);

  return {
    workspace: {
      id: String(workspaceRaw.id ?? "unknown"),
      title: String(workspaceRaw.title ?? ""),
      phase: (workspaceRaw.phase as WorkspacePhase) ?? "idle",
    },
    context: {
      summary: String(contextRaw.summary ?? ""),
      activeFile:
        contextRaw.activeFile === null || contextRaw.activeFile === undefined
          ? null
          : String(contextRaw.activeFile),
      tokenEstimate:
        typeof contextRaw.tokenEstimate === "number"
          ? contextRaw.tokenEstimate
          : undefined,
    },
    task: {
      current:
        taskRaw.current === null || taskRaw.current === undefined
          ? null
          : String(taskRaw.current),
      items: asRecord(taskRaw.items) as Record<string, TaskItem>,
    },
    files: asRecord(raw.files) as Record<string, FileEntry>,
    tools: asRecord(raw.tools) as Record<string, ToolRun>,
    artifacts: asRecord(raw.artifacts) as Record<string, Artifact>,
    presence: asRecord(raw.presence) as Record<string, Presence>,
    recovery:
      raw.recovery && typeof raw.recovery === "object"
        ? (raw.recovery as RecoveryState)
        : undefined,
  };
}

/** Shallow top-level patch — matches StateStore merge semantics. */
export function workspaceDiff(
  patch: Partial<WorkspaceData>,
  timestamp = Date.now(),
): StateDiff {
  return {
    mutation: {
      data: patch as unknown as Record<string, unknown>,
    },
    timestamp,
  };
}

export function workspaceDataToStore(data: WorkspaceData): Record<string, unknown> {
  return { ...data } as unknown as Record<string, unknown>;
}

export function convergenceFingerprint(state: GlobalState): string {
  const w = readWorkspace(state);
  return JSON.stringify({
    version: state.version,
    status: state.status,
    workspace: w.workspace,
    context: w.context,
    task: w.task,
    files: w.files,
    artifacts: Object.keys(w.artifacts).sort(),
    tools: Object.keys(w.tools).sort(),
  });
}
