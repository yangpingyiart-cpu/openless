import { EventBus } from "./event-bus";
import {
  GlobalState,
  StateDiff,
  StateStore,
} from "./state-store";

export const EVENT_STATE_UPDATE = "state:update";
export const EVENT_ERROR_TRANSITION = "error:transition";

export type TransitionRule = {
  name: string;
  condition: (state: GlobalState, diff: StateDiff) => boolean;
  action: (state: GlobalState, diff: StateDiff) => void;
};

export interface StateUpdatePayload {
  state: GlobalState;
  diff: StateDiff;
  previousState: GlobalState;
}

export interface TransitionErrorPayload {
  state: GlobalState;
  diff: StateDiff;
  reason: string;
  rule?: string;
}

export class TransitionValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionValidationError";
  }
}

const VALID_STATUSES: ReadonlySet<GlobalState["status"]> = new Set([
  "active",
  "recovering",
  "error",
]);

function isRecoveryDataKey(key: string): boolean {
  return key === "recovery" || key.startsWith("recovery.");
}

function isRecoveryMutation(diff: StateDiff): boolean {
  const { mutation } = diff;

  if (
    mutation.status !== undefined &&
    mutation.status !== "active" &&
    mutation.status !== "error"
  ) {
    return false;
  }

  if (mutation.data) {
    for (const key of Object.keys(mutation.data)) {
      if (!isRecoveryDataKey(key)) {
        return false;
      }
    }
  }

  return true;
}

export function createRecoveryRule(): TransitionRule {
  return {
    name: "recovery",
    condition: (state) => state.status === "recovering",
    action: (_state, diff) => {
      if (!isRecoveryMutation(diff)) {
        throw new TransitionValidationError(
          "Only recovery mutations are allowed while status is 'recovering'",
        );
      }
    },
  };
}

export class TransitionEngine {
  private readonly rules: TransitionRule[];

  constructor(
    private readonly store: StateStore,
    private readonly bus: EventBus,
    rules: TransitionRule[] = [createRecoveryRule()],
  ) {
    this.rules = [...rules];
  }

  addRule(rule: TransitionRule): void {
    this.rules.push(rule);
  }

  applyTransition(diff: StateDiff): boolean {
    const previousState = this.store.getState();

    const validationError = this.validateDiff(diff);
    if (validationError) {
      this.emitError(previousState, diff, validationError);
      return false;
    }

    if (!this.runRules(previousState, diff)) {
      return false;
    }

    const state = this.store.applyDiff(diff);
    this.bus.emit<StateUpdatePayload>(EVENT_STATE_UPDATE, {
      state,
      diff,
      previousState,
    });

    return true;
  }

  /**
   * Authoritative snapshot from a peer (full-sync). Structural validation only;
   * transition rules do not apply (peer state wins).
   */
  applyFullSync(remoteState: GlobalState): boolean {
    const previousState = this.store.getState();
    const validationError = this.validateGlobalState(remoteState);
    if (validationError) {
      const diff: StateDiff = {
        mutation: {},
        timestamp: Date.now(),
      };
      this.emitError(previousState, diff, validationError);
      return false;
    }

    const state = this.store.resetState({
      version: remoteState.version,
      status: remoteState.status,
      data: remoteState.data,
    });

    const diff: StateDiff = {
      mutation: {
        version: remoteState.version,
        status: remoteState.status,
        data: remoteState.data,
      },
      timestamp: Date.now(),
    };

    this.bus.emit<StateUpdatePayload>(EVENT_STATE_UPDATE, {
      state,
      diff,
      previousState,
    });

    return true;
  }

  private validateGlobalState(state: GlobalState): string | null {
    if (!state || typeof state !== "object") {
      return "Full-sync state must be an object";
    }

    if (typeof state.version !== "number" || !Number.isFinite(state.version)) {
      return "Full-sync version must be a finite number";
    }

    if (!VALID_STATUSES.has(state.status)) {
      return `Invalid full-sync status: ${String(state.status)}`;
    }

    if (state.data === undefined || typeof state.data !== "object") {
      return "Full-sync data must be an object";
    }

    return null;
  }

  private validateDiff(diff: StateDiff): string | null {
    if (!diff || typeof diff !== "object") {
      return "Diff must be an object";
    }

    if (typeof diff.timestamp !== "number" || !Number.isFinite(diff.timestamp)) {
      return "Diff timestamp must be a finite number";
    }

    if (!diff.mutation || typeof diff.mutation !== "object") {
      return "Diff mutation must be an object";
    }

    const { mutation } = diff;

    if (
      mutation.status !== undefined &&
      !VALID_STATUSES.has(mutation.status)
    ) {
      return `Invalid status: ${String(mutation.status)}`;
    }

    if (mutation.data !== undefined && typeof mutation.data !== "object") {
      return "Mutation data must be an object";
    }

    if (
      mutation.version !== undefined &&
      typeof mutation.version !== "number"
    ) {
      return "Mutation version must be a number when provided";
    }

    return null;
  }

  private runRules(state: GlobalState, diff: StateDiff): boolean {
    for (const rule of this.rules) {
      if (!rule.condition(state, diff)) {
        continue;
      }

      try {
        rule.action(state, diff);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "Transition rule failed";
        this.emitError(state, diff, reason, rule.name);
        return false;
      }
    }

    return true;
  }

  private emitError(
    state: GlobalState,
    diff: StateDiff,
    reason: string,
    rule?: string,
  ): void {
    this.bus.emit<TransitionErrorPayload>(EVENT_ERROR_TRANSITION, {
      state,
      diff,
      reason,
      rule,
    });
  }
}
