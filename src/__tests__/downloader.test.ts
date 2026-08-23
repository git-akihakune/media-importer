import { describe, it, expect, vi } from "vitest";
import { Downloader, FetchRequester } from "../downloader";

describe("Downloader", () => {
  it("returns buffer on 2xx", async () => {
    const req: FetchRequester = {
      fetch: vi.fn(async (_url, _opts) => ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(4), contentType: "image/png" })),
    };
    const d = new Downloader(req, { timeoutMs: 5000 });
    const r = await d.fetch("https://x.com/cat.png", { dryRun: false });
    expect(r).not.toBeNull();
    expect(r!.dryRun).toBe(false);
  });
  it("returns null on 404", async () => {
    const req: FetchRequester = { fetch: vi.fn(async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), contentType: "" })) };
    const d = new Downloader(req, { timeoutMs: 5000 });
    expect(await d.fetch("https://x.com/x.png", { dryRun: false })).toBeNull();
  });
  it("dry-run skips fetch and returns sentinel", async () => {
    const req: FetchRequester = { fetch: vi.fn(async () => { throw new Error("should not be called"); }) };
    const d = new Downloader(req, { timeoutMs: 5000 });
    const r = await d.fetch("https://x.com/cat.png", { dryRun: true });
    expect(r).not.toBeNull();
    expect(r!.dryRun).toBe(true);
    expect(req.fetch).not.toHaveBeenCalled();
  });
});