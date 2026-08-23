import { describe, it, expect, vi } from "vitest";
import { runImport, ImporterDeps } from "../importer";
import { MediaImporterSettings } from "../settings";
import { Backend } from "../storage/backend";
import { DryRunAccumulator } from "../progress";
import { VaultAdapter } from "../vault-adapter";
import { FakeVault } from "./helpers/fake-vault";

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

const fakeBackend = (selfProducedPrefix = "media/"): Backend => ({
  put: vi.fn(async (_buf: ArrayBuffer, name: string) => `${selfProducedPrefix}${name}`),
  dryRunDest: vi.fn(async (name: string) => `${selfProducedPrefix}${name}`),
  selfProduced: (url: string) => url.startsWith(selfProducedPrefix),
  ping: vi.fn(async () => {}),
});

const fakeDeps = (vault: VaultAdapter, backend: Backend): ImporterDeps => ({
  vault,
  backend,
  fetch: {
    fetch: vi.fn(async (_url: string, _opts) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" })),
  },
  head: {
    head: vi.fn(async (_url: string) => ({ contentLength: 100 })),
  },
});

describe("runImport — live run", () => {
  it("downloads and rewrites a single image", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.downloaded).toBe(1);
    expect(report.rewritten).toBe(1);
    expect(deps.fetch.fetch).toHaveBeenCalledTimes(1);
    expect(backend.put).toHaveBeenCalledTimes(1);
    // Vault content was modified via vault.modifyText
  });
  it("skips URLs the backend says it produced", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](media/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.candidates).toBe(0);
    expect(report.downloaded).toBe(0);
  });
  it("leaves note untouched when any ref in it fails to fetch (atomicity)", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![a](https://x.com/a.png)\n![b](https://x.com/b.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    deps.fetch.fetch = vi.fn(async (url: string) => url.includes("b") ? { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), contentType: "" } : { ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" });
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.failed).toHaveLength(1);
    expect(report.rewritten).toBe(0);
  });
});

describe("runImport — dry run", () => {
  it("does not fetch, store, or modify; reports would-download/rewrite", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "![cat](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const acc = new DryRunAccumulator();
    const report = await runImport(deps, baseSettings, { dryRun: true }, acc);
    expect(deps.fetch.fetch).not.toHaveBeenCalled();
    expect(backend.put).not.toHaveBeenCalled();
    expect(report.downloaded).toBe(0);
    expect(acc.wouldDownload).toHaveLength(1);
    expect(acc.wouldRewrite).toHaveLength(1);
  });
});

describe("runImport — wrapped image-link collapse", () => {
  it("collapses [![alt](url)](url) to ![alt](local) end-to-end", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "[![cat](https://x.com/cat.png)](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.downloaded).toBe(1);
    expect(report.rewritten).toBe(1);
    expect(vault.files[0].content).toBe("![cat](media/cat.png)");
  });
  it("leaves wrapper link untouched when href differs from src", async () => {
    const note = "[![cat](https://x.com/cat.png)](https://x.com/article)";
    const vault = new FakeVault([{ path: "a.md", content: note }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const report = await runImport(deps, baseSettings, { dryRun: false });
    expect(report.downloaded).toBe(1);
    expect(report.rewritten).toBe(1);
    expect(vault.files[0].content).toBe("[![cat](media/cat.png)](https://x.com/article)");
  });
  it("reports collapse in dry-run would-rewrite", async () => {
    const vault = new FakeVault([{ path: "a.md", content: "[![cat](https://x.com/cat.png)](https://x.com/cat.png)" }]);
    const backend = fakeBackend();
    const deps = fakeDeps(vault, backend);
    const acc = new DryRunAccumulator();
    await runImport(deps, baseSettings, { dryRun: true }, acc);
    expect(acc.wouldRewrite).toHaveLength(1);
    expect(acc.wouldRewrite[0].newUrl).toBe("media/cat.png");
    expect(acc.wouldRewrite[0].ref.linkUrl).toBe("https://x.com/cat.png");
  });
});
