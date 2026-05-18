/**
 * Run all Phase 1.6 law probes (observation only — not pass/fail).
 */
import { execSync } from "node:child_process";
import path from "node:path";

const probes = [
  "001-noop-replay",
  "002-stale-overwrite",
  "003-replay-ambiguity",
  "004-observer-recovery",
  "005-version-inflation",
  "006-lag-oscillation",
  "007-semantic-divergence",
];

const root = path.join(__dirname);

console.log("Phase 1.6 — Law Probes (all)\n");

for (const id of probes) {
  const script = path.join(root, id, "probe.ts");
  console.log(`\n${"=".repeat(60)}\nPROBE ${id}\n${"=".repeat(60)}`);
  execSync(`npx ts-node "${script}"`, { stdio: "inherit", cwd: path.join(root, "../..") });
}

console.log("\n=== ALL LAW PROBES COMPLETE ===\n");
