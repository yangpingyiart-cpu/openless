import type { GlobalState, StateDiff } from "../../core/state-store";

/** Application view of `GlobalState.data` for the shared-todo scenario. */
export interface TodoItem {
  readonly title: string;
  readonly done: boolean;
}

export interface TodoBoard {
  readonly todos: Record<string, TodoItem>;
  readonly nextId: number;
}

const EMPTY_BOARD: TodoBoard = { todos: {}, nextId: 1 };

export function readBoard(state: GlobalState): TodoBoard {
  const raw = state.data;
  const todos =
    raw.todos && typeof raw.todos === "object"
      ? (raw.todos as Record<string, TodoItem>)
      : {};
  const nextId =
    typeof raw.nextId === "number" && Number.isFinite(raw.nextId)
      ? raw.nextId
      : 1;
  return { todos, nextId };
}

export function boardDiff(
  board: TodoBoard,
  timestamp = Date.now(),
): StateDiff {
  return {
    mutation: {
      data: {
        todos: board.todos,
        nextId: board.nextId,
      },
    },
    timestamp,
  };
}

export function addTodo(board: TodoBoard, title: string): TodoBoard {
  const id = String(board.nextId);
  return {
    todos: {
      ...board.todos,
      [id]: { title, done: false },
    },
    nextId: board.nextId + 1,
  };
}

export function toggleTodo(board: TodoBoard, id: string): TodoBoard | null {
  const item = board.todos[id];
  if (!item) {
    return null;
  }
  return {
    todos: {
      ...board.todos,
      [id]: { ...item, done: !item.done },
    },
    nextId: board.nextId,
  };
}

export function emptyBoard(): TodoBoard {
  return { ...EMPTY_BOARD };
}
