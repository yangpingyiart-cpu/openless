/**
 * Cognition-pressure diagnostics for long-running chat-thread validation.
 * Tracks usage confusion signals — not runtime correctness.
 */

export type FrictionKind =
  | "overwrite_lww"
  | "observer_attribution"
  | "recovery_visibility"
  | "idempotency_gap"
  | "applylocal_opaque"
  | "full_map_rewrite"
  | "lag_reset_store"
  | "semantic_collapse"
  | "version_ordering"
  | "sent_vs_store_gap";

export type PressureClass = "repeating" | "accumulating" | "one_shot";

export interface FrictionHit {
  readonly kind: FrictionKind;
  readonly phase: string;
  readonly detail: string;
}

export interface PressureMetric {
  readonly name: string;
  readonly value: number;
  readonly note: string;
}

export interface PhaseSnapshot {
  readonly phase: string;
  readonly logicalSends: number;
  readonly storeMessages: number;
  readonly observerDerivedAppends: number;
  readonly version: number;
  readonly sendGap: number;
  readonly observerGap: number;
}

export class CognitionLedger {
  private readonly hits: FrictionHit[] = [];
  private readonly kindCounts = new Map<FrictionKind, number>();
  private readonly phasesByKind = new Map<FrictionKind, Set<string>>();
  private readonly phaseSnapshots: PhaseSnapshot[] = [];
  private logicalSends = 0;
  private stalePairs = 0;
  private messagesLostToStale = 0;
  private noopReplayBumps = 0;
  private lagLoops = 0;
  private observerSyncCompleteMisses = 0;
  private convergenceChecks = 0;
  private convergenceFailures = 0;

  record(kind: FrictionKind, phase: string, detail: string): void {
    this.hits.push({ kind, phase, detail });
    this.kindCounts.set(kind, (this.kindCounts.get(kind) ?? 0) + 1);
    const phases = this.phasesByKind.get(kind) ?? new Set<string>();
    phases.add(phase);
    this.phasesByKind.set(kind, phases);
  }

  noteLogicalSend(): void {
    this.logicalSends += 1;
  }

  noteStalePair(messagesLost: number): void {
    this.stalePairs += 1;
    this.messagesLostToStale += messagesLost;
    if (messagesLost > 0) {
      this.record(
        "overwrite_lww",
        "stale_pair",
        `lost ${messagesLost} message(s) in concurrent pair`,
      );
    }
  }

  noteNoopReplay(bumps: number): void {
    this.noopReplayBumps += bumps;
    if (bumps > 0) {
      this.record(
        "idempotency_gap",
        "replay",
        `noop replay advanced version by ${bumps}`,
      );
    }
  }

  noteLagLoop(observerSawSyncComplete: boolean): void {
    this.lagLoops += 1;
    if (!observerSawSyncComplete) {
      this.observerSyncCompleteMisses += 1;
      this.record(
        "recovery_visibility",
        "lag_loop",
        "observer did not see sync:complete",
      );
    }
    this.record("lag_reset_store", "lag_loop", "lag simulated via store.resetState");
  }

  noteConvergence(ok: boolean): void {
    this.convergenceChecks += 1;
    if (!ok) this.convergenceFailures += 1;
  }

  snapshotPhase(
    phase: string,
    storeMessages: number,
    observerDerivedAppends: number,
    version: number,
  ): void {
    const sendGap = this.logicalSends - storeMessages;
    const observerGap = observerDerivedAppends - storeMessages;
    this.phaseSnapshots.push({
      phase,
      logicalSends: this.logicalSends,
      storeMessages,
      observerDerivedAppends,
      version,
      sendGap,
      observerGap,
    });
    if (sendGap > 0) {
      this.record(
        "sent_vs_store_gap",
        phase,
        `logical sends ${this.logicalSends} vs store ${storeMessages} (gap=${sendGap})`,
      );
    }
  }

  classify(kind: FrictionKind): PressureClass {
    const count = this.kindCounts.get(kind) ?? 0;
    const phaseCount = this.phasesByKind.get(kind)?.size ?? 0;
    if (count <= 1 && phaseCount <= 1) return "one_shot";
    if (
      kind === "sent_vs_store_gap" ||
      kind === "overwrite_lww" ||
      kind === "version_ordering"
    ) {
      const gaps = this.phaseSnapshots.map((s) => s.sendGap);
      const growing =
        gaps.length >= 2 && gaps[gaps.length - 1]! > gaps[0]!;
      if (growing || this.messagesLostToStale >= 3) return "accumulating";
    }
    if (kind === "observer_attribution" && this.observerSyncCompleteMisses >= 2) {
      return "accumulating";
    }
    if (count >= 3 || phaseCount >= 2) return "repeating";
    return "one_shot";
  }

  buildReport(): string {
    const kinds = [...this.kindCounts.keys()].sort();
    const byClass: Record<PressureClass, FrictionKind[]> = {
      repeating: [],
      accumulating: [],
      one_shot: [],
    };
    for (const k of kinds) {
      byClass[this.classify(k)].push(k);
    }

    const lines: string[] = [
      "=== COGNITION PRESSURE REPORT ===",
      "",
      "## Session totals",
      `  logical sends:        ${this.logicalSends}`,
      `  stale pairs:          ${this.stalePairs}`,
      `  messages lost (stale): ${this.messagesLostToStale}`,
      `  noop replay bumps:    ${this.noopReplayBumps}`,
      `  lag loops:            ${this.lagLoops}`,
      `  observer sync misses: ${this.observerSyncCompleteMisses}`,
      `  convergence checks:   ${this.convergenceChecks} (failures: ${this.convergenceFailures})`,
      `  friction hits:        ${this.hits.length}`,
      "",
      "## Classification (usage confusion, not correctness)",
      "",
      "### REPEATING — shows up again; becomes expected background noise",
      ...this.formatKindList(byClass.repeating),
      "",
      "### ACCUMULATING — gap/drift grows; confusion compounds over session",
      ...this.formatKindList(byClass.accumulating),
      "",
      "### ONE_SHOT — awkward first encounter; does not compound",
      ...this.formatKindList(byClass.one_shot),
      "",
      "## Phase send-gap trajectory (logical sends − store messages)",
    ];

    if (this.phaseSnapshots.length === 0) {
      lines.push("  (no phase snapshots)");
    } else {
      for (const s of this.phaseSnapshots) {
        lines.push(
          `  ${s.phase.padEnd(22)} sends=${s.logicalSends} store=${s.storeMessages} gap=${s.sendGap} v=${s.version}`,
        );
      }
      const first = this.phaseSnapshots[0]!.sendGap;
      const last = this.phaseSnapshots[this.phaseSnapshots.length - 1]!.sendGap;
      lines.push(
        `  → gap ${first} → ${last} ${last > first ? "(GROWING — accumulating confusion)" : "(stable)"}`,
      );
    }

    lines.push("", "## Recent friction hits (last 15)");
    const tail = this.hits.slice(-15);
    if (tail.length === 0) {
      lines.push("  (none)");
    } else {
      for (const h of tail) {
        lines.push(`  [${h.phase}] ${h.kind}: ${h.detail}`);
      }
    }

    return lines.join("\n");
  }

  private formatKindList(kinds: FrictionKind[]): string[] {
    if (kinds.length === 0) return ["  (none in this bucket)"];
    return kinds.map((k) => {
      const n = this.kindCounts.get(k) ?? 0;
      const phases = [...(this.phasesByKind.get(k) ?? [])].join(", ");
      return `  - ${k}: ${n} hit(s) across [${phases}]`;
    });
  }
}
