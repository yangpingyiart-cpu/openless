import type { GlobalState, StateDiff } from "../../core/state-store";

export interface TodoItem {
  readonly title: string;
  readonly done: boolean;
  readonly assignee: string | null;
}

export interface TodoUser {
  readonly displayName: string;
}

export interface TodoPresence {
  readonly lastSeen: number;
  readonly focus: string | null;
}

export interface TodoMetadata {
  readonly boardTitle: string;
  readonly nextId: number;
}

/** Application view of `GlobalState.data` — top-level keys only. */
export interface TodoState {
  readonly todos: Record<string, TodoItem>;
  readonly users: Record<string, TodoUser>;
  readonly presence: Record<string, TodoPresence>;
  readonly metadata: TodoMetadata;
}

export function emptyTodoState(boardTitle = "Shared Todo"): TodoState {
  return {
    todos: {},
    users: {},
    presence: {},
    metadata: { boardTitle, nextId: 1 },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function readTodoState(state: GlobalState): TodoState {
  const raw = state.data;
  const meta = asRecord(raw.metadata);
  return {
    todos: asRecord(raw.todos) as Record<string, TodoItem>,
    users: asRecord(raw.users) as Record<string, TodoUser>,
    presence: asRecord(raw.presence) as Record<string, TodoPresence>,
    metadata: {
      boardTitle: String(meta.boardTitle ?? "Shared Todo"),
      nextId:
        typeof meta.nextId === "number" && Number.isFinite(meta.nextId)
          ? meta.nextId
          : 1,
    },
  };
}

export function todoStateToStore(data: TodoState): Record<string, unknown> {
  return {
    todos: data.todos,
    users: data.users,
    presence: data.presence,
    metadata: data.metadata,
  };
}

/** Shallow top-level patch — matches StateStore merge semantics. */
export function todoDiff(
  patch: Partial<TodoState>,
  timestamp = Date.now(),
): StateDiff {
  return {
    mutation: { data: patch as unknown as Record<string, unknown> },
    timestamp,
  };
}

export function checksum(state: GlobalState): string {
  const t = readTodoState(state);
  return JSON.stringify({
    version: state.version,
    status: state.status,
    todos: t.todos,
    users: t.users,
    presence: Object.keys(t.presence).sort(),
    metadata: t.metadata,
  });
}

export function summaryJson(state: GlobalState): string {
  const t = readTodoState(state);
  return JSON.stringify(
    {
      version: state.version,
      status: state.status,
      todoCount: Object.keys(t.todos).length,
      todos: t.todos,
      metadata: t.metadata,
    },
    null,
    2,
  );
}
