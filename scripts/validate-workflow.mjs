import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const EXPECTED_STEPS = [
  "Checkout",
  "Setup Node",
  "Install dependencies",
  "Lint",
  "Typecheck",
  "Test",
  "Build (production)",
  "Read manifest version",
  "Determine expected version",
  "Assert version consistency",
  "Update versions.json",
  "Commit versions.json",
  "Ensure tag exists (workflow_dispatch)",
  "Create release",
];

function fail(message) {
  console.error(message);
  process.exit(1);
}

const text = readFileSync(".github/workflows/release.yml", "utf8");
let wf;
try {
  wf = yaml.load(text);
} catch (e) {
  fail(`invalid YAML: ${e.message}`);
}

if (!wf.on || !("push" in wf.on)) fail("missing push trigger");
if (!("workflow_dispatch" in wf.on)) fail("missing workflow_dispatch trigger");
if (!Array.isArray(wf.on.push?.tags) || wf.on.push.tags.length !== 1 || wf.on.push.tags[0] !== "v*") {
  fail("push tags must be ['v*']");
}
if (wf.permissions?.contents !== "write") fail("contents:write permission missing");

const job = wf.jobs?.release;
if (!job) fail("missing jobs.release");
if (job["runs-on"] !== "ubuntu-latest") fail("must run on ubuntu-latest");

const names = (job.steps ?? []).map((s) => s.name);
for (const expected of EXPECTED_STEPS) {
  if (!names.includes(expected)) fail(`missing step: ${expected}`);
}

console.log(`OK: ${EXPECTED_STEPS.length} expected steps present, triggers and permissions valid`);