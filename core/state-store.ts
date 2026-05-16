export interface GlobalState {
  version: number;
  data: Record<string, any>;
  status: "active" | "recovering" | "error";
}

export interface StateDiff {
  mutation: Partial<GlobalState>;
  timestamp: number;
}

const DEFAULT_STATE: GlobalState = {
  version: 0,
  data: {},
  status: "active",
};

function cloneState(state: GlobalState): GlobalState {
  return structuredClone(state);
}

function createState(overrides?: Partial<GlobalState>): GlobalState {
  return {
    version: overrides?.version ?? DEFAULT_STATE.version,
    status: overrides?.status ?? DEFAULT_STATE.status,
    data: { ...DEFAULT_STATE.data, ...overrides?.data },
  };
}

/**
 * In-memory store for {@link GlobalState}.
 * {@link applyDiff} always increments `version`; any `version` in the diff is ignored.
 */
export class StateStore {
  private state: GlobalState;

  constructor(initialState?: Partial<GlobalState>) {
    this.state = createState(initialState);
  }

  getState(): GlobalState {
    return cloneState(this.state);
  }

  applyDiff(diff: StateDiff): GlobalState {
    const { mutation } = diff;

    this.state = {
      version: this.state.version + 1,
      status: mutation.status ?? this.state.status,
      data:
        mutation.data !== undefined
          ? { ...this.state.data, ...mutation.data }
          : { ...this.state.data },
    };

    return this.getState();
  }

  resetState(overrides?: Partial<GlobalState>): GlobalState {
    this.state = createState(overrides);
    return this.getState();
  }
}
