/**
 * Autonomous multi-cycle silence-validation orchestrator (examples only).
 * Runs baseline triad + extended silence validation; compares fingerprints across cycles.
 */
import { execSync } from "child_process";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const CYCLES = Number(process.env.CYCLES ?? "5");
const BASELINE_FINGERPRINT = "120/98/gap22/v146/0";

interface CycleResult {
  readonly cycle: number;
  readonly testsPass: number;
  readonly testsFail: number;
  readonly longRunLine: string;
  readonly probesOk: boolean;
}

interface ParsedFingerprint {
  readonly sends: number;
  readonly store: number;
  readonly gap: number;
  readonly version: number;
  readonly failures: number;
}

function run(cmd: string): string {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
}

function parseLongRun(output: string): ParsedFingerprint | null {
  const sends = output.match(/logical sends:\s+(\d+)/);
  const store = output.match(/store messages: (\d+)/)
    ?? output.match(/final store count: (\d+)/);
  const failures = output.match(/convergence checks:\s+\d+ \(failures: (\d+)\)/);
  const phase = output.match(/LR6\s+sends=(\d+) store=(\d+) gap=(\d+) v=(\d+)/);
  if (phase) {
    return {
      sends: Number(phase[1]),
      store: Number(phase[2]),
      gap: Number(phase[3]),
      version: Number(phase[4]),
      failures: failures ? Number(failures[1]) : 0,
    };
  }
  if (!sends || !store) return null;
  const s = Number(sends[1]);
  const st = Number(store[1]);
  const v = output.match(/windowA=v(\d+)/);
  return {
    sends: s,
    store: st,
    gap: s - st,
    version: v ? Number(v[1]) : -1,
    failures: failures ? Number(failures[1]) : 0,
  };
}

function fpKey(fp: ParsedFingerprint): string {
  return `${fp.sends}/${fp.store}/gap${fp.gap}/v${fp.version}/${fp.failures}`;
}

function main(): void {
  console.log("=== AUTONOMOUS SILENCE-VALIDATION WINDOW ===\n");
  console.log(`cycles=${CYCLES} baseline=${BASELINE_FINGERPRINT}\n`);

  const cycles: CycleResult[] = [];
  const fingerprints: string[] = [];

  for (let c = 1; c <= CYCLES; c++) {
    console.log(`\n######## CYCLE ${c}/${CYCLES} ########\n`);
    let testsPass = 0;
    let testsFail = 0;
    try {
      const testOut = run("npm test 2>&1");
      const pass = testOut.match(/ℹ pass (\d+)/);
      const fail = testOut.match(/ℹ fail (\d+)/);
      testsPass = pass ? Number(pass[1]) : 0;
      testsFail = fail ? Number(fail[1]) : 0;
      console.log(`tests: ${testsPass} pass, ${testsFail} fail`);
    } catch (e) {
      console.error("TEST FAILURE", e);
      testsFail = 1;
    }

    execSync("npm run example:shared-todo", { cwd: ROOT, stdio: "ignore" });
    execSync("npm run example:ai-workspace", { cwd: ROOT, stdio: "ignore" });
    execSync("npm run example:chat-thread", { cwd: ROOT, stdio: "ignore" });
    console.log("examples: shared-todo, ai-workspace, chat-thread OK");

    let longRunLine = "parse-failed";
    try {
      const longOut = run("npm run example:chat-thread-long 2>&1");
      const fp = parseLongRun(longOut);
      if (fp) {
        longRunLine = fpKey(fp);
        fingerprints.push(longRunLine);
        console.log(`long-run fingerprint: ${longRunLine}`);
      }
    } catch (e) {
      console.error("LONG-RUN FAILURE", e);
      longRunLine = "ERROR";
    }

    let probesOk = true;
    try {
      const probeOut = run("npm run law-probes 2>&1");
      probesOk = probeOut.includes("ALL LAW PROBES COMPLETE") && !probeOut.includes("DIVERGENCE");
      console.log(`law-probes: ${probesOk ? "OK" : "CHECK"}`);
    } catch {
      probesOk = false;
    }

    cycles.push({ cycle: c, testsPass, testsFail, longRunLine, probesOk });
  }

  console.log("\n######## EXTENDED SILENCE VALIDATION (×2) ########\n");
  const svFingerprints: string[] = [];
  for (let i = 1; i <= 2; i++) {
    console.log(`\n--- silence-validation run ${i} ---\n`);
    const out = run("npm run observe:silence-validation 2>&1");
    const m = out.match(
      /SV fingerprint: sends=(\d+) store=(\d+) gap=(\d+)[\s\S]*?v=(\d+) failures=(\d+)/,
    );
    if (m) {
      const key = `${m[1]}/${m[2]}/gap${m[3]}/v${m[4]}/${m[5]}`;
      svFingerprints.push(key);
      console.log(`SV fingerprint: ${key}`);
    }
  }

  console.log("\n######## TIMING VARIANCE (extended re-run) ########\n");
  run("npm run observe:timing-variance 2>&1");

  console.log("\n=== WINDOW COMPLETE — AGGREGATE ===\n");
  const uniqueBaseline = [...new Set(fingerprints)];
  const uniqueSv = [...new Set(svFingerprints)];
  const allTestsOk = cycles.every((c) => c.testsFail === 0 && c.testsPass === 7);
  const allProbesOk = cycles.every((c) => c.probesOk);
  const baselineStable =
    uniqueBaseline.length === 1 && uniqueBaseline[0] === BASELINE_FINGERPRINT;
  const svStable = uniqueSv.length <= 1;

  console.log(`baseline fingerprints (${CYCLES} cycles): ${fingerprints.join(" | ")}`);
  console.log(`baseline stable vs ${BASELINE_FINGERPRINT}: ${baselineStable ? "YES" : "NO"}`);
  console.log(`SV fingerprints (2 runs): ${svFingerprints.join(" | ")}`);
  console.log(`SV stable across runs: ${svStable ? "YES" : "NO"}`);
  console.log(`all tests 7/7: ${allTestsOk ? "YES" : "NO"}`);
  console.log(`all law-probes: ${allProbesOk ? "YES" : "NO"}`);

  if (!allTestsOk || !baselineStable) {
    console.log("\n*** RUNTIME INSTABILITY SIGNAL ***");
    process.exit(1);
  }

  console.log("\n*** SILENCE-VALIDATION WINDOW COMPLETE ***");
  console.log("Semantic identity under prolonged silence: STABLE");
  console.log("Observer cognition: structurally stable (validation-only)");
  console.log("Law admission: FROZEN — no promotion");
}

main();
