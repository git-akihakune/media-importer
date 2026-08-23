import { describe, it, expect, vi } from "vitest";
import { wipeBackend } from "../ops";
import { FakeVault } from "./helpers/fake-vault";
import { Backend } from "../storage/backend";
import { MediaImporterSettings } from "../settings";

const makeBackend = (selfProducedPrefix: string, deleted: string[] = []): Backend => ({
  put: vi.fn(async (_buf: ArrayBuffer, name: string) => `${selfProducedPrefix}${name}`),
  dryRunDest: vi.fn(async (name: string) => `${selfProducedPrefix}${name}`),
  selfProduced: (url: string) => url.startsWith(selfProducedPrefix),
  ping: vi.fn(async () => {}),
  get: vi.fn(async () => new ArrayBuffer(0)),
  delete: vi.fn(async (url: string) => { deleted.push(url); }),
});

const baseSettings: MediaImporterSettings = {
  scanPaths: [],
  detectors: { mdImage: true, mdAv: true, wikilink: false, htmlImg: false, htmlAv: false },
  allowlist: ["*"],
  denylist: [],
  sizeLimitMB: null,
  activeBackend: "local",
  local: { folder: "media" },
  webdav: { baseURL: "", username: "", password: "", avoidOverwrite: false },
  s3: { endpoint: "", region: "", bucket: "", accessKeyId: "", secretAccessKey: "", keyPrefix: "", publicUrlTemplate: "" },
  requestTimeoutSec: 30,
};

describe("wipeBackend", () => {
  it("deletes only selfProduced URLs", async () => {
    const vault = new FakeVault([
      { path: "note1.md", content: "![a](https://src/a.png) ![b](https://other.com/b.png)" },
    ]);
    const deleted: string[] = [];
    const backend = makeBackend("https://src/", deleted);
    const report = await wipeBackend({ vault, backend }, baseSettings);
    expect(deleted).toEqual(["https://src/a.png"]);
    expect(report.deleted).toBe(1);
    expect(report.failed).toEqual([]);
  });
  it("dedupes URLs referenced by multiple notes", async () => {
    const vault = new FakeVault([
      { path: "n1.md", content: "![a](https://src/a.png)" },
      { path: "n2.md", content: "![a](https://src/a.png)" },
    ]);
    const deleted: string[] = [];
    const backend = makeBackend("https://src/", deleted);
    const report = await wipeBackend({ vault, backend }, baseSettings);
    expect(deleted).toEqual(["https://src/a.png"]);
    expect(report.deleted).toBe(1);
  });
  it("logs per-file failures without aborting", async () => {
    const vault = new FakeVault([{ path: "n.md", content: "![a](https://src/a.png) ![b](https://src/b.png)" }]);
    const backend = makeBackend("https://src/");
    backend.delete = vi.fn(async (url: string) => {
      if (url === "https://src/a.png") throw new Error("boom");
    });
    const report = await wipeBackend({ vault, backend }, baseSettings);
    expect(report.deleted).toBe(1);
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].url).toBe("https://src/a.png");
  });
  it("rewrites nothing (notes keep broken links)", async () => {
    const vault = new FakeVault([{ path: "n.md", content: "![a](https://src/a.png)" }]);
    const original = vault.files[0].content;
    const backend = makeBackend("https://src/");
    await wipeBackend({ vault, backend }, baseSettings);
    expect(vault.files[0].content).toBe(original);
  });
});