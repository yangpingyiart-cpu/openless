import type { OpenLessNode } from "../../index";
import {
  readThreadState,
  threadDiff,
  type ChatMessage,
  type ChatThreadState,
} from "./thread-model";

/** Writes only via `node.applyLocal`. */
export class ChatClient {
  constructor(
    readonly node: OpenLessNode,
    readonly windowId: string,
  ) {}

  seedThread(): boolean {
    const data = readThreadState(this.node.store.getState());
    if (Object.keys(data.messages).length > 0) {
      return true;
    }
    return this.node.applyLocal(
      threadDiff({
        thread: data.thread,
        messages: data.messages,
        metadata: data.metadata,
        presence: data.presence,
      }),
    );
  }

  appendMessage(
    role: ChatMessage["role"],
    text: string,
    timestamp = Date.now(),
  ): string | null {
    const data = readThreadState(this.node.store.getState());
    const id = String(data.metadata.nextMessageId);
    const messages = {
      ...data.messages,
      [id]: {
        role,
        author: this.windowId,
        text,
        createdAt: timestamp,
      },
    };
    const metadata = {
      ...data.metadata,
      nextMessageId: data.metadata.nextMessageId + 1,
    };
    const ok = this.node.applyLocal(threadDiff({ messages, metadata }));
    return ok ? id : null;
  }

  setTyping(typing: boolean): boolean {
    const data = readThreadState(this.node.store.getState());
    return this.node.applyLocal(
      threadDiff({
        presence: {
          ...data.presence,
          [this.windowId]: { lastSeen: Date.now(), typing },
        },
      }),
    );
  }

  read(): ChatThreadState {
    return readThreadState(this.node.store.getState());
  }

  /** Replay same metadata blob (noop at data layer; version may still advance). */
  replayMetadataDuplicate(times = 1): { applied: number; versionBumps: number } {
    const v0 = this.node.store.getState().version;
    let applied = 0;
    for (let i = 0; i < times; i++) {
      const dup = threadDiff({
        metadata: readThreadState(this.node.store.getState()).metadata,
      });
      if (this.node.applyLocal(dup)) applied += 1;
    }
    const bumps = this.node.store.getState().version - v0;
    return { applied, versionBumps: bumps };
  }
}
