import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
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

/**
 * Validate a release workflow YAML string.
 * @param {string} text
 * @returns {{ ok: boolean, message: string }}
 */
export function validateWorkflow(text) {
  let wf;
  try {
    wf = yaml.load(text);
  } catch (e) {
    return { ok: false, message: `invalid YAML: ${e.message}` };
  }

  if (!wf.on || !("push" in wf.on)) {
    return { ok: false, message: "missing push trigger" };
  }
  if (!("workflow_dispatch" in wf.on)) {
    return { ok: false, message: "missing workflow_dispatch trigger" };
  }
  if (
    !Array.isArray(wf.on.push?.tags) ||
    wf.on.push.tags.length !== 1 ||
    wf.on.push.tags[0] !== "v*"
  ) {
    return { ok: false, message: "push tags must be ['v*']" };
  }
  if (wf.permissions?.contents !== "write") {
    return { ok: false, message: "contents:write permission missing" };
  }

  const job = wf.jobs?.release;
  if (!job) return { ok: false, message: "missing jobs.release" };
  if (job["runs-on"] !== "ubuntu-latest") {
    return { ok: false, message: "must run on ubuntu-latest" };
  }

  const names = (job.steps ?? []).map((s) => s.name);
  let lastIndex = -1;
  for (const expected of EXPECTED_STEPS) {
    const idx = names.indexOf(expected);
    if (idx === -1) {
      return { ok: false, message: `missing step: ${expected}` };
    }
    if (idx <= lastIndex) {
      return { ok: false, message: `step out of order: ${expected}` };
    }
    lastIndex = idx;
  }

  return { ok: true, message: `OK: ${EXPECTED_STEPS.length} expected steps present, triggers and permissions valid` };
}

function main() {
  const text = readFileSync(".github/workflows/release.yml", "utf8");
  const result = validateWorkflow(text);
  if (result.ok) {
    console.log(result.message);
  } else {
    console.error(result.message);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}