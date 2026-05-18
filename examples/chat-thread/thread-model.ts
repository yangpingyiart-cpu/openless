import type { GlobalState, StateDiff } from "../../core/state-store";

export interface ChatMessage {
  readonly role: "user" | "assistant" | "system";
  readonly author: string;
  readonly text: string;
  readonly createdAt: number;
}

export interface ThreadMeta {
  readonly id: string;
  readonly title: string;
}

export interface ThreadMetadata {
  readonly nextMessageId: number;
}

export interface Presence {
  readonly lastSeen: number;
  readonly typing: boolean;
}

/** Top-level keys only — matches StateStore shallow merge. */
export interface ChatThreadState {
  readonly thread: ThreadMeta;
  readonly messages: Record<string, ChatMessage>;
  readonly metadata: ThreadMetadata;
  readonly presence: Record<string, Presence>;
}

export function emptyThreadState(threadId = "thread-1"): ChatThreadState {
  return {
    thread: { id: threadId, title: "Shared chat" },
    messages: {},
    metadata: { nextMessageId: 1 },
    presence: {},
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function readThreadState(state: GlobalState): ChatThreadState {
  const raw = state.data;
  const threadRaw = asRecord(raw.thread);
  const metaRaw = asRecord(raw.metadata);
  return {
    thread: {
      id: String(threadRaw.id ?? "unknown"),
      title: String(threadRaw.title ?? ""),
    },
    messages: asRecord(raw.messages) as Record<string, ChatMessage>,
    metadata: {
      nextMessageId:
        typeof metaRaw.nextMessageId === "number" &&
        Number.isFinite(metaRaw.nextMessageId)
          ? metaRaw.nextMessageId
          : 1,
    },
    presence: asRecord(raw.presence) as Record<string, Presence>,
  };
}

export function threadStateToStore(data: ChatThreadState): Record<string, unknown> {
  return {
    thread: data.thread,
    messages: data.messages,
    metadata: data.metadata,
    presence: data.presence,
  };
}

export function threadDiff(
  patch: Partial<ChatThreadState>,
  timestamp = Date.now(),
): StateDiff {
  return {
    mutation: { data: patch as unknown as Record<string, unknown> },
    timestamp,
  };
}

export function checksum(state: GlobalState): string {
  const t = readThreadState(state);
  const messageKeys = Object.keys(t.messages).sort();
  return JSON.stringify({
    version: state.version,
    status: state.status,
    thread: t.thread,
    messageKeys,
    messages: t.messages,
    nextMessageId: t.metadata.nextMessageId,
  });
}

export function summaryJson(state: GlobalState): string {
  const t = readThreadState(state);
  const ordered = Object.keys(t.messages)
    .sort((a, b) => Number(a) - Number(b))
    .map((id) => ({ id, ...t.messages[id]! }));
  return JSON.stringify(
    {
      version: state.version,
      messageCount: ordered.length,
      messages: ordered,
    },
    null,
    2,
  );
}
