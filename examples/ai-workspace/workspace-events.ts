import { EVENT_STATE_UPDATE, type StateUpdatePayload } from "../../index";
import type { OpenLessNode } from "../../index";
import {
  readWorkspace,
  type WorkspaceContext,
  type WorkspaceData,
  type WorkspacePhase,
} from "./workspace-model";

export type WorkspaceAppEvent =
  | {
      type: "workspace:phase-changed";
      nodeId: string;
      from: WorkspacePhase;
      to: WorkspacePhase;
      version: number;
    }
  | {
      type: "workspace:context-updated";
      nodeId: string;
      context: WorkspaceContext;
      version: number;
    }
  | {
      type: "workspace:artifact-added";
      nodeId: string;
      artifactIds: string[];
      version: number;
    }
  | {
      type: "workspace:presence-changed";
      nodeId: string;
      presenceKeys: string[];
      version: number;
    };

export type WorkspaceAppEventHandler = (event: WorkspaceAppEvent) => void;

function artifactIds(data: WorkspaceData): string[] {
  return Object.keys(data.artifacts).sort();
}

function presenceKeys(data: WorkspaceData): string[] {
  return Object.keys(data.presence).sort();
}

/**
 * Derives app-level events from runtime `state:update` only.
 */
export function attachWorkspaceEventBridge(
  node: OpenLessNode,
  onEvent: WorkspaceAppEventHandler,
): () => void {
  const handler = (payload: StateUpdatePayload) => {
    const prev = readWorkspace(payload.previousState);
    const next = readWorkspace(payload.state);

    if (prev.workspace.phase !== next.workspace.phase) {
      onEvent({
        type: "workspace:phase-changed",
        nodeId: node.nodeId,
        from: prev.workspace.phase,
        to: next.workspace.phase,
        version: payload.state.version,
      });
    }

    if (JSON.stringify(prev.context) !== JSON.stringify(next.context)) {
      onEvent({
        type: "workspace:context-updated",
        nodeId: node.nodeId,
        context: next.context,
        version: payload.state.version,
      });
    }

    const prevArtifacts = artifactIds(prev);
    const nextArtifacts = artifactIds(next);
    const added = nextArtifacts.filter((id) => !prevArtifacts.includes(id));
    if (added.length > 0) {
      onEvent({
        type: "workspace:artifact-added",
        nodeId: node.nodeId,
        artifactIds: added,
        version: payload.state.version,
      });
    }

    if (JSON.stringify(prev.presence) !== JSON.stringify(next.presence)) {
      onEvent({
        type: "workspace:presence-changed",
        nodeId: node.nodeId,
        presenceKeys: presenceKeys(next),
        version: payload.state.version,
      });
    }
  };

  node.bus.subscribe<StateUpdatePayload>(EVENT_STATE_UPDATE, handler);
  return () => node.bus.unsubscribe(EVENT_STATE_UPDATE, handler);
}
