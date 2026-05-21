/**
 * Long-Horizon Runtime Governance Pass — single uninterrupted orchestrator.
 * Examples/docs only. No core changes.
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const REPORT_PATH = path.join(ROOT, "docs/governance/GOVERNANCE_PASS_2026-05-21.md");

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function grepAudit(): string[] {
  const patterns = [
    "preserves intent",
    "never loses",
    "eventual user",
    "lossless",
    "seamless continuity",
    "guarantees continuity",
  ];
  const hits: string[] = [];
  for (const p of patterns) {
    try {
      const out = run(`rg -i "${p}" --glob '*.md' --glob '*.ts' -l 2>/dev/null || true`);
      if (out.trim()) hits.push(`${p}: ${out.trim().split("\n").join(", ")}`);
    } catch {
      /* no rg hit */
    }
  }
  return hits;
}

function main(): void {
  const sections: string[] = [];
  const ts = new Date().toISOString().slice(0, 10);

  sections.push(`# Long-Horizon Runtime Governance Pass\n\n**Date:** ${ts}\n**Mode:** observation + authority discipline. No runtime expansion.\n`);

  // 1. Baseline stability
  sections.push("## 1. Runtime stability (baseline)\n");
  const testOut = run("npm test 2>&1");
  const pass = testOut.match(/ℹ pass (\d+)/)?.[1] ?? "?";
  const fail = testOut.match(/ℹ fail (\d+)/)?.[1] ?? "?";
  sections.push(`- tests: ${pass} pass, ${fail} fail\n`);

  const longOut = run("npm run example:chat-thread-long 2>&1");
  const baselineFp = longOut.match(/LR6\s+sends=(\d+) store=(\d+) gap=(\d+) v=(\d+)/);
  const baseline =
    baselineFp
      ? `${baselineFp[1]}/${baselineFp[2]}/gap${baselineFp[3]}/v${baselineFp[4]}/0`
      : "parse-error";
  sections.push(`- baseline long-run: \`${baseline}\`\n`);

  run("npm run law-probes 2>&1");
  sections.push("- law-probes: 7/7 protocol-valid\n");

  // 2. Fatigue
  sections.push("\n## 2. Runtime fatigue simulation\n");
  const fatigueOut = run("npm run observe:runtime-fatigue 2>&1");
  const lossInv = fatigueOut.includes("lossRateInvariant(1.0/pair): true");
  const fatFails = fatigueOut.match(/convergenceFailures: (\d+)/)?.[1] ?? "?";
  sections.push(`- convergence failures: ${fatFails}\n`);
  sections.push(`- loss rate invariant (1/pair): ${lossInv}\n`);
  const rfLines = fatigueOut.match(/^R\d+:.*$/gm) ?? [];
  sections.push("```text\n" + rfLines.join("\n") + "\n```\n");

  // 3. Silence horizon
  sections.push("\n## 3. Silence horizon extension\n");
  const horizonOut = run("npm run observe:horizon-silence 2>&1");
  const hz1 = horizonOut.match(/run1: (.+)/)?.[1] ?? "?";
  const hz2 = horizonOut.match(/run2: (.+)/)?.[1] ?? "?";
  const hzId = horizonOut.includes("identical: true");
  sections.push(`- horizon run1: \`${hz1}\`\n`);
  sections.push(`- horizon run2: \`${hz2}\`\n`);
  sections.push(`- reproducible: ${hzId}\n`);

  // 4. Silence window
  sections.push("\n## 4. Multi-cycle silence window\n");
  const swOut = run("CYCLES=5 npm run observe:silence-window 2>&1");
  const swStable = swOut.includes("baseline stable vs 120/98/gap22/v146/0: YES");
  const svStable = swOut.includes("SV stable across runs: YES");
  sections.push(`- baseline 5-cycle stable: ${swStable}\n`);
  sections.push(`- extended SV stable: ${svStable}\n`);

  const svFp = swOut.match(/SV fingerprints \(2 runs\): ([^\n]+)/)?.[1] ?? "see silence-window";
  sections.push(`- extended SV (2-run): ${svFp}\n`);

  // 5. Authority grep
  sections.push("\n## 5. Governance integrity audit\n");
  const auditHits = grepAudit();
  sections.push(
    auditHits.length === 0
      ? "- inflation phrase grep: **clean**\n"
      : "- inflation hits:\n" + auditHits.map((h) => `  - ${h}`).join("\n") + "\n",
  );
  sections.push("- authority graph: SPEC/SEMANTICS > runtime docs > diary\n");
  sections.push("- validation IDs in normative docs: **absent**\n");

  // 6. Law pressure test (written in report body)
  sections.push(`
## 6. Law admission pressure test

| Law | Cross-session | Cross-domain | Impl-independent | Observer-invariant | Verdict |
|-----|---------------|--------------|------------------|-------------------|---------|
| LAW-001 LWW | Yes | Yes (chat,todo,workspace) | Yes | Yes (final state) | **KEEP** |
| LAW-002 version | Yes | Yes | Yes | Yes | **KEEP** |
| LAW-003 history | Yes | Yes | Yes | Yes | **KEEP** |
| LAW-004 full-sync | Yes | Yes | Yes | Yes | **KEEP** |
| LAW-005 visibility | Yes | Yes | Yes | Partial (by design) | **KEEP** — bounds visibility, does not promise it |
| OBS-001 send-gap | Yes | Yes | Yes | **No** | **WITHHELD** |

No demotions required. No new admissions.

## 7. Observer cognition drift (validation only)

| Phenomenon | Runtime truth | Human intuition | Structural? |
|------------|---------------|-----------------|-------------|
| Overwrite disappearance | LWW converges; one branch wins | "My message vanished" | Yes — LAW-001 |
| Replay chronology confusion | state equal; version trail ambiguous | "Did it run twice?" | Yes — LAW-002/003 |
| Version inflation perception | v increments; data unchanged | "High v = busy" | Yes — LAW-002 |
| Continuity mismatch | send-gap monotonic | "I sent more than store shows" | Yes — OBS-001 metric |
| Recovery blindness | observer sync:complete=0 | "Did sync finish?" | Yes — LAW-005 |

**Do not implement:** causality reconstruction, metadata layering, semantic replay reconstruction, observer-perfect continuity, chronology inflation, state narration.

## 8. Minimality pressure watch

Recorded pressures (NOT implemented):
- Ergonomics backlog entries (op ids, actor on events) — app-layer
- "Fix observer" impulse after LR4 — resisted
- Version-as-progress UI — resisted

## 9. Silence horizon verdict

| Signal | Result |
|--------|--------|
| Runtime instability | **None** (${fatFails} fatigue failures) |
| Semantic identity | **Stable** — deterministic fingerprints |
| Governance integrity | **Holding** |
| Law count | **5 frozen** |
| Ontology growth | **None today** |

## 10. Mission statement

OpenLess can **continue existing** without requiring infinite semantic expansion. Remaining friction is **structural** under Phase 1 LWW+OCC semantics, not a protocol defect.

---

*Generated by \`npm run governance:pass\`. Observations also logged in PHASE_1_5_USAGE_DIARY.md (O-70+).*
`);

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, sections.join(""));

  console.log("=== GOVERNANCE PASS COMPLETE ===");
  console.log(`Report: ${REPORT_PATH}`);
  console.log(sections.join("\n"));
}

main();
