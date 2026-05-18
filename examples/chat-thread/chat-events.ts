import { EVENT_STATE_UPDATE, type StateUpdatePayload } from "../../index";
import type { OpenLessNode } from "../../index";
import { readThreadState, type ChatMessage } from "./thread-model";

export type ChatAppEvent =
  | {
      type: "message:appended";
      nodeId: string;
      messageId: string;
      message: ChatMessage;
      version: number;
    }
  | {
      type: "thread:updated";
      nodeId: string;
      title: string;
      version: number;
    }
  | {
      type: "presence:changed";
      nodeId: string;
      windowIds: string[];
      version: number;
    };

export type ChatAppEventHandler = (event: ChatAppEvent) => void;

export function attachChatEventBridge(
  node: OpenLessNode,
  onEvent: ChatAppEventHandler,
): () => void {
  const handler = (payload: StateUpdatePayload) => {
    const prev = readThreadState(payload.previousState);
    const next = readThreadState(payload.state);
    const nodeId = node.nodeId;
    const version = payload.state.version;

    const prevIds = new Set(Object.keys(prev.messages));
    for (const id of Object.keys(next.messages)) {
      if (!prevIds.has(id)) {
        onEvent({
          type: "message:appended",
          nodeId,
          messageId: id,
          message: next.messages[id]!,
          version,
        });
      }
    }

    if (prev.thread.title !== next.thread.title) {
      onEvent({
        type: "thread:updated",
        nodeId,
        title: next.thread.title,
        version,
      });
    }

    if (JSON.stringify(prev.presence) !== JSON.stringify(next.presence)) {
      onEvent({
        type: "presence:changed",
        nodeId,
        windowIds: Object.keys(next.presence).sort(),
        version,
      });
    }
  };

  node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, handler);
  return () => node.bus.unsubscribe(EVENT_STATE_UPDATE, handler);
}
