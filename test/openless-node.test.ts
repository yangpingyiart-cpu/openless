import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  DiffBroadcastPayload,
  DiffReceivedPayload,
  EVENT_DIFF_BROADCAST,
  EVENT_DIFF_RECEIVED,
  EVENT_SYNC_COMPLETE,
  EVENT_SYNC_REQUEST,
  SyncCompletePayload,
  SyncRequestPayload,
} from "../core/delta-syncer";
import { GlobalState } from "../core/state-store";
import {
  EVENT_ERROR_TRANSITION,
  EVENT_STATE_UPDATE,
  StateUpdatePayload,
  TransitionErrorPayload,
} from "../core/transition-engine";
import {
  counterDiff,
  createLinkedNodes,
  createNode,
  statesEqual,
} from "./helpers";

function collect<T>(subscribe: (handler: (payload: T) => void) => void): T[] {
  const items: T[] = [];
  subscribe((payload) => items.push(payload));
  return items;
}

describe("OpenLessNode runtime invariants", () => {
  test("applyLocal success: version +1, peer receives diff, states converge", () => {
    const { a, b } = createLinkedNodes();
    const broadcasts = collect<DiffBroadcastPayload>((h) =>
      a.bus.subscribe(EVENT_DIFF_BROADCAST, h),
    );
    const received = collect<DiffReceivedPayload>((h) =>
      b.bus.subscribe(EVENT_DIFF_RECEIVED, h),
    );

    const versionBefore = a.store.getState().version;
    const diff = counterDiff(1);
    const accepted = a.applyLocal(diff);

    assert.equal(accepted, true);
    assert.equal(a.store.getState().version, versionBefore + 1);
    assert.equal(a.store.getState().data.counter, 1);

    assert.equal(broadcasts.length, 1);
    assert.equal(broadcasts[0]!.nodeId, a.nodeId);
    assert.equal(broadcasts[0]!.versioned.version, a.store.getState().version);
    assert.deepEqual(broadcasts[0]!.versioned.diff, diff);

    assert.equal(received.length, 1);
    assert.equal(received[0]!.applied, true);
    assert.equal(received[0]!.fromPeerId, a.nodeId);

    assert.equal(b.store.getState().version, a.store.getState().version);
    assert.equal(b.store.getState().data.counter, 1);
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);
  });

  test("inbound sequenced diff: applyTransition, applied=true, no full-sync", () => {
    const node = createNode({ nodeId: "solo" });
    const received = collect<DiffReceivedPayload>((h) =>
      node.bus.subscribe(EVENT_DIFF_RECEIVED, h),
    );
    const syncRequests = collect<SyncRequestPayload>((h) =>
      node.bus.subscribe(EVENT_SYNC_REQUEST, h),
    );
    const updates = collect<StateUpdatePayload>((h) =>
      node.bus.subscribe(EVENT_STATE_UPDATE, h),
    );

    node.handleInbound(
      {
        type: "diff",
        payload: { version: 1, diff: counterDiff(10) },
      },
      "peer-x",
    );

    assert.equal(node.store.getState().version, 1);
    assert.equal(node.store.getState().data.counter, 10);
    assert.equal(received.length, 1);
    assert.equal(received[0]!.applied, true);
    assert.equal(syncRequests.length, 0);
    assert.equal(updates.length, 1);
  });

  test("inbound gap: no apply, diff:received(false), full-sync, convergence", () => {
    const { a, b } = createLinkedNodes();
    assert.equal(a.applyLocal(counterDiff(1)), true);
    assert.equal(b.store.getState().version, 1);

    const beforeB = b.store.getState();
    const received = collect<DiffReceivedPayload>((h) =>
      b.bus.subscribe(EVENT_DIFF_RECEIVED, h),
    );
    const syncRequests = collect<SyncRequestPayload>((h) =>
      b.bus.subscribe(EVENT_SYNC_REQUEST, h),
    );
    const syncComplete = collect<SyncCompletePayload>((h) =>
      b.bus.subscribe(EVENT_SYNC_COMPLETE, h),
    );

    b.handleInbound(
      {
        type: "diff",
        payload: {
          version: 3,
          diff: counterDiff(999),
        },
      },
      a.nodeId,
    );

    assert.equal(b.store.getState().version, beforeB.version);
    assert.equal(b.store.getState().data.counter, beforeB.data.counter);

    assert.equal(received.length, 1);
    assert.equal(received[0]!.applied, false);
    assert.equal(syncRequests.length, 1);
    assert.equal(syncRequests[0]!.localVersion, 1);
    assert.equal(syncRequests[0]!.incomingVersion, 3);

    assert.equal(syncComplete.length, 1);
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);
    assert.equal(b.store.getState().data.counter, 1);
  });

  test("duplicate inbound: state and version unchanged on replay", () => {
    const node = createNode({ nodeId: "solo" });
    const updates = collect<StateUpdatePayload>((h) =>
      node.bus.subscribe(EVENT_STATE_UPDATE, h),
    );
    const errors = collect<TransitionErrorPayload>((h) =>
      node.bus.subscribe(EVENT_ERROR_TRANSITION, h),
    );

    const versioned = {
      version: 1,
      diff: counterDiff(42, 1000),
    };

    node.handleInbound({ type: "diff", payload: versioned }, "peer");
    const afterFirst = node.store.getState();

    node.handleInbound({ type: "diff", payload: versioned }, "peer");
    const afterSecond = node.store.getState();

    assert.equal(statesEqual(afterFirst, afterSecond), true);
    assert.equal(updates.length, 1);
    assert.equal(errors.length, 0);
    assert.equal(node.store.getState().version, 1);
  });

  test("recovering state rejects illegal inbound diff", () => {
    const node = createNode({
      nodeId: "recovering-node",
      initialState: { status: "recovering" },
    });
    const errors = collect<TransitionErrorPayload>((h) =>
      node.bus.subscribe(EVENT_ERROR_TRANSITION, h),
    );
    const updates = collect<StateUpdatePayload>((h) =>
      node.bus.subscribe(EVENT_STATE_UPDATE, h),
    );

    const before = node.store.getState();

    node.handleInbound(
      {
        type: "diff",
        payload: {
          version: 1,
          diff: {
            mutation: { data: { notAllowed: true } },
            timestamp: Date.now(),
          },
        },
      },
      "peer",
    );

    assert.equal(errors.length, 1);
    assert.equal(updates.length, 0);
    assert.equal(node.store.getState().version, before.version);
    assert.equal(node.store.getState().status, "recovering");
    assert.deepEqual(node.store.getState().data, before.data);
  });

  test("invalid full-sync payload: rejected, store unchanged", () => {
    const node = createNode({ nodeId: "solo" });
    const errors = collect<TransitionErrorPayload>((h) =>
      node.bus.subscribe(EVENT_ERROR_TRANSITION, h),
    );
    const updates = collect<StateUpdatePayload>((h) =>
      node.bus.subscribe(EVENT_STATE_UPDATE, h),
    );

    const before = node.store.getState();

    node.handleInbound(
      {
        type: "full-sync",
        payload: {
          state: {
            version: 5,
            status: "invalid-status" as GlobalState["status"],
            data: {},
          },
        },
      },
      "peer",
    );

    assert.equal(errors.length, 1);
    assert.equal(updates.length, 0);
    assert.equal(node.store.getState().version, before.version);
    assert.equal(node.store.getState().status, before.status);
    assert.deepEqual(node.store.getState().data, before.data);
  });

  test("two-node convergence: applyLocal, gap, duplicate replay, full-sync", () => {
    const { a, b } = createLinkedNodes();

    assert.equal(a.applyLocal(counterDiff(1)), true);
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);

    const broadcasts = collect<DiffBroadcastPayload>((h) =>
      a.bus.subscribe(EVENT_DIFF_BROADCAST, h),
    );
    assert.equal(a.applyLocal(counterDiff(2)), true);
    const lastBroadcast = broadcasts.at(-1)!;
    const versionedAtV2 = lastBroadcast.versioned;

    b.store.resetState({ version: 0, data: {}, status: "active" });

    b.handleInbound(
      {
        type: "diff",
        payload: {
          version: 2,
          diff: counterDiff(99),
        },
      },
      a.nodeId,
    );
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);
    assert.equal(b.store.getState().data.counter, 2);

    b.handleInbound(
      { type: "diff", payload: versionedAtV2 },
      a.nodeId,
    );
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);
    assert.equal(b.store.getState().version, a.store.getState().version);

    b.store.resetState({ version: 0, data: { stale: true }, status: "active" });
    b.handleInbound(
      {
        type: "full-sync",
        payload: { state: a.store.getState() },
      },
      a.nodeId,
    );

    assert.equal(a.store.getState().version, b.store.getState().version);
    assert.equal(statesEqual(a.store.getState(), b.store.getState()), true);
    assert.equal(b.store.getState().data.counter, 2);
    assert.equal(b.store.getState().data.stale, undefined);
  });
});
