import { describe, it, expect, vi, afterEach, beforeEach, type MockInstance } from "vitest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { readManifestInfo, writeOutputs } from "../../scripts/release-info.mjs";

describe("readManifestInfo", () => {
  it("returns { version, minAppVersion } from the real manifest", () => {
    const info = readManifestInfo("../manifest.json");
    expect(info.version).toBe("0.1.1");
    expect(info.minAppVersion).toBe("1.6.6");
  });

  it("throws on missing version or minAppVersion", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-info-"));
    try {
      const manifestPath = join(dir, "bad-manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ id: "x" }));
      const url = pathToFileURL(manifestPath).href;
      expect(() => readManifestInfo(url)).toThrow(/missing version or minAppVersion/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("writeOutputs", () => {
  let logSpy: MockInstance;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it("writes key=value lines to a file path when provided", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-info-out-"));
    const outPath = join(dir, "github-output.txt");
    try {
      writeOutputs({ version: "1.2.3", minAppVersion: "1.5.0" }, outPath);
      const written = readFileSync(outPath, "utf8");
      expect(written).toBe("version=1.2.3\nmin_app_version=1.5.0\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("writes to console.log when no path", () => {
    writeOutputs({ version: "1.2.3", minAppVersion: "1.5.0" }, undefined);
    expect(logSpy).toHaveBeenCalledWith("version=1.2.3");
    expect(logSpy).toHaveBeenCalledWith("min_app_version=1.5.0");
  });
});