import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateWorkflow } from "../../scripts/validate-workflow.mjs";

const REAL_WORKFLOW = readFileSync(".github/workflows/release.yml", "utf8");

const ALL_STEPS = [
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
]
  .map((name) => `      - name: ${name}\n        run: echo x`)
  .join("\n");

describe("validateWorkflow", () => {
  it("returns ok=true for the real release.yml", () => {
    const result = validateWorkflow(REAL_WORKFLOW);
    expect(result.ok).toBe(true);
  });

  it("returns ok=false for missing push trigger", () => {
    const text = `
name: Release
on:
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${ALL_STEPS}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "missing push trigger" });
  });

  it("returns ok=false for missing workflow_dispatch trigger", () => {
    const text = `
name: Release
on:
  push:
    tags:
      - '[0-9]*'
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${ALL_STEPS}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "missing workflow_dispatch trigger" });
  });

  it("returns ok=false for wrong push tags", () => {
    const text = `
name: Release
on:
  push:
    tags:
      - 'x*'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${ALL_STEPS}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "push tags must be ['[0-9]*']" });
  });

  it("returns ok=false for missing contents:write permission", () => {
    const text = `
name: Release
on:
  push:
    tags:
      - '[0-9]*'
  workflow_dispatch:
permissions: {}
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${ALL_STEPS}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "contents:write permission missing" });
  });

  it("returns ok=false for wrong runs-on", () => {
    const text = `
name: Release
on:
  push:
    tags:
      - '[0-9]*'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    runs-on: windows-latest
    steps:
${ALL_STEPS}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "must run on ubuntu-latest" });
  });

  it("returns ok=false for a missing step", () => {
    const steps = ALL_STEPS.replace("      - name: Build (production)\n        run: echo x\n", "");
    const text = `
name: Release
on:
  push:
    tags:
      - '[0-9]*'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${steps}
`;
    expect(validateWorkflow(text)).toEqual({ ok: false, message: "missing step: Build (production)" });
  });

  it("returns ok=false when steps are in wrong order", () => {
    const names = [
      "Setup Node",
      "Checkout",
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
    const steps = names.map((name) => `      - name: ${name}\n        run: echo x`).join("\n");
    const text = `
name: Release
on:
  push:
    tags:
      - '[0-9]*'
  workflow_dispatch:
permissions:
  contents: write
jobs:
  release:
    runs-on: ubuntu-latest
    steps:
${steps}
`;
    const result = validateWorkflow(text);
    expect(result.ok).toBe(false);
    expect(result.message).toBe("step out of order: Setup Node");
  });
});