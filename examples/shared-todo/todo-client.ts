import type { OpenLessNode } from "../../index";
import {
  readTodoState,
  todoDiff,
  type TodoItem,
  type TodoState,
} from "./todo-model";

/**
 * Application client — all writes via `node.applyLocal` only.
 */
export class TodoClient {
  constructor(
    readonly node: OpenLessNode,
    readonly userId: string,
    readonly displayName: string,
  ) {}

  seedBoard(): boolean {
    const data = readTodoState(this.node.store.getState());
    const users = {
      ...data.users,
      [this.userId]: { displayName: this.displayName },
    };
    return this.node.applyLocal(todoDiff({ users, metadata: data.metadata }));
  }

  addTodo(title: string): string | null {
    const data = readTodoState(this.node.store.getState());
    const id = String(data.metadata.nextId);
    const todos = {
      ...data.todos,
      [id]: { title, done: false, assignee: null },
    };
    const metadata = { ...data.metadata, nextId: data.metadata.nextId + 1 };
    const ok = this.node.applyLocal(todoDiff({ todos, metadata }));
    return ok ? id : null;
  }

  editTodoTitle(id: string, title: string): boolean {
    const data = readTodoState(this.node.store.getState());
    const item = data.todos[id];
    if (!item) {
      return false;
    }
    return this.node.applyLocal(
      todoDiff({
        todos: { ...data.todos, [id]: { ...item, title } },
      }),
    );
  }

  completeTodo(id: string, done = true): boolean {
    const data = readTodoState(this.node.store.getState());
    const item = data.todos[id];
    if (!item) {
      return false;
    }
    return this.node.applyLocal(
      todoDiff({
        todos: { ...data.todos, [id]: { ...item, done } },
      }),
    );
  }

  assignTodo(id: string, assignee: string): boolean {
    const data = readTodoState(this.node.store.getState());
    const item = data.todos[id];
    if (!item) {
      return false;
    }
    return this.node.applyLocal(
      todoDiff({
        todos: { ...data.todos, [id]: { ...item, assignee } },
      }),
    );
  }

  setPresence(focus: string | null): boolean {
    const data = readTodoState(this.node.store.getState());
    return this.node.applyLocal(
      todoDiff({
        presence: {
          ...data.presence,
          [this.userId]: { lastSeen: Date.now(), focus },
        },
      }),
    );
  }

  read(): TodoState {
    return readTodoState(this.node.store.getState());
  }
}
