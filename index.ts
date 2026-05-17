/**
 * OpenLess public runtime API (Phase 1).
 *
 * Use {@link OpenLessNode} as the only runtime entry for local and inbound mutations.
 */

export {
  OpenLessNode,
  type OpenLessNodeOptions,
} from "./core/openless-node";

export {
  DeltaSyncer,
  InMemorySyncHub,
  InMemorySyncPeer,
  EVENT_DIFF_BROADCAST,
  EVENT_DIFF_RECEIVED,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  type DiffBroadcastPayload,
  type DiffReceivedPayload,
  type InboundHandler,
  type SyncCompletePayload,
  type SyncMessage,
  type SyncPeer,
  type SyncRequestPayload,
  type VersionedDiff,
} from "./core/delta-syncer";

export {
  TransitionEngine,
  TransitionValidationError,
  createRecoveryRule,
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  type StateUpdatePayload,
  type TransitionErrorPayload,
  type TransitionRule,
} from "./core/transition-engine";

export {
  StateStore,
  type GlobalState,
  type StateDiff,
} from "./core/state-store";

export { EventBus, type EventHandler } from "./core/event-bus";
