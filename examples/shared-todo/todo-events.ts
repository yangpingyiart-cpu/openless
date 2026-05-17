import { EVENT_STATE_UPDATE, type StateUpdatePayload } from "../../index";
import type { OpenLessNode } from "../../index";
import { readTodoState, type TodoItem } from "./todo-model";

export type TodoAppEvent =
  | {
      type: "todo:added";
      nodeId: string;
      todoId: string;
      item: TodoItem;
      version: number;
    }
  | {
      type: "todo:updated";
      nodeId: string;
      todoId: string;
      before: TodoItem;
      after: TodoItem;
      version: number;
    }
  | {
      type: "todo:completed";
      nodeId: string;
      todoId: string;
      done: boolean;
      version: number;
    }
  | {
      type: "todo:assigned";
      nodeId: string;
      todoId: string;
      assignee: string | null;
      version: number;
    }
  | {
      type: "presence:changed";
      nodeId: string;
      userIds: string[];
      version: number;
    };

export type TodoAppEventHandler = (event: TodoAppEvent) => void;

function todoIds(data: ReturnType<typeof readTodoState>): string[] {
  return Object.keys(data.todos).sort();
}

export function attachTodoEventBridge(
  node: OpenLessNode,
  onEvent: TodoAppEventHandler,
): () => void {
  const handler = (payload: StateUpdatePayload) => {
    const prev = readTodoState(payload.previousState);
    const next = readTodoState(payload.state);
    const nodeId = node.nodeId;
    const version = payload.state.version;

    const prevIds = new Set(todoIds(prev));
    const nextIds = new Set(todoIds(next));

    for (const id of nextIds) {
      if (!prevIds.has(id)) {
        onEvent({
          type: "todo:added",
          nodeId,
          todoId: id,
          item: next.todos[id]!,
          version,
        });
        continue;
      }

      const before = prev.todos[id]!;
      const after = next.todos[id]!;
      if (before.title !== after.title) {
        onEvent({
          type: "todo:updated",
          nodeId,
          todoId: id,
          before,
          after,
          version,
        });
      }
      if (before.done !== after.done) {
        onEvent({
          type: "todo:completed",
          nodeId,
          todoId: id,
          done: after.done,
          version,
        });
      }
      if (before.assignee !== after.assignee) {
        onEvent({
          type: "todo:assigned",
          nodeId,
          todoId: id,
          assignee: after.assignee,
          version,
        });
      }
    }

    if (JSON.stringify(prev.presence) !== JSON.stringify(next.presence)) {
      onEvent({
        type: "presence:changed",
        nodeId,
        userIds: Object.keys(next.presence).sort(),
        version,
      });
    }
  };

  node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, handler);
  return () => node.bus.unsubscribe(EVENT_STATE_UPDATE, handler);
}
