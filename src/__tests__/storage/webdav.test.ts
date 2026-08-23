import { describe, it, expect, vi } from "vitest";
import { WebDAVBackend } from "../../storage/webdav";

const makeBackend = (
  puts: Record<string, ArrayBuffer>,
  opts: { avoidOverwrite?: boolean; testStatus?: number; testOk?: boolean; getBuf?: ArrayBuffer; getOk?: boolean; getStatus?: number; deleteOk?: boolean; deleteStatus?: number } = {},
) => {
  const putFn = vi.fn(async (url: string, buf: ArrayBuffer) => {
    puts[url] = buf;
    return { ok: true, status: 201 };
  });
  const headFn = vi.fn(async (url: string) => ({ exists: url in puts }));
  const testFn = vi.fn(async () => ({ ok: opts.testOk ?? true, status: opts.testStatus ?? 200 }));
  const getFn = vi.fn(async () => ({
    ok: opts.getOk ?? true,
    status: opts.getStatus ?? 200,
    arrayBuffer: opts.getBuf ?? new ArrayBuffer(0),
  }));
  const deleteFn = vi.fn(async () => ({
    ok: opts.deleteOk ?? true,
    status: opts.deleteStatus ?? 204,
  }));
  return {
    backend: new WebDAVBackend(
      { baseURL: "https://dav.example.com/media/", username: "u", password: "p", avoidOverwrite: opts.avoidOverwrite ?? false },
      { put: putFn, head: headFn, test: testFn, get: getFn, delete: deleteFn },
    ),
    putFn,
    headFn,
    testFn,
    getFn,
    deleteFn,
  };
};

describe("WebDAVBackend", () => {
  it("put uploads to baseURL+name and returns public URL", async () => {
    const { backend, putFn } = makeBackend({});
    const url = await backend.put(new ArrayBuffer(4), "cat.png");
    expect(putFn).toHaveBeenCalledWith(
      "https://dav.example.com/media/cat.png",
      expect.any(ArrayBuffer),
      { username: "u", password: "p" },
    );
    expect(url).toBe("https://dav.example.com/media/cat.png");
  });

  it("avoidOverwrite appends -N on collision (via HEAD check)", async () => {
    const { backend, headFn } = makeBackend(
      { "https://dav.example.com/media/cat.png": new ArrayBuffer(0) },
      { avoidOverwrite: true },
    );
    const url = await backend.put(new ArrayBuffer(4), "cat.png");
    expect(headFn).toHaveBeenCalled();
    expect(url).toBe("https://dav.example.com/media/cat-1.png");
  });

  it("selfProduced matches baseURL prefix", async () => {
    const { backend } = makeBackend({});
    expect(backend.selfProduced("https://dav.example.com/media/cat.png")).toBe(true);
    expect(backend.selfProduced("https://other.com/cat.png")).toBe(false);
  });

  describe("ping", () => {
    it("resolves when test returns ok", async () => {
      const { backend } = makeBackend({}, { testOk: true, testStatus: 200 });
      await expect(backend.ping()).resolves.toBeUndefined();
    });
    it("throws unauthorized on 401", async () => {
      const { backend } = makeBackend({}, { testOk: false, testStatus: 401 });
      await expect(backend.ping()).rejects.toThrow("WebDAV: unauthorized — check username/password");
    });
    it("throws not found on 404", async () => {
      const { backend } = makeBackend({}, { testOk: false, testStatus: 404 });
      await expect(backend.ping()).rejects.toThrow("WebDAV: base URL not found — check baseURL");
    });
    it("throws unreachable on status 0", async () => {
      const { backend } = makeBackend({}, { testOk: false, testStatus: 0 });
      await expect(backend.ping()).rejects.toThrow("WebDAV: cannot reach endpoint — check baseURL and network");
    });
    it("throws unexpected status on other codes", async () => {
      const { backend } = makeBackend({}, { testOk: false, testStatus: 500 });
      await expect(backend.ping()).rejects.toThrow("WebDAV: unexpected status 500");
    });
  });

  describe("get", () => {
    it("returns arrayBuffer when req.get returns ok", async () => {
      const buf = new ArrayBuffer(8);
      const { backend } = makeBackend({}, { getBuf: buf });
      const result = await backend.get("https://dav.example.com/media/cat.png");
      expect(result).toBe(buf);
    });
    it("throws with status when req.get returns not ok", async () => {
      const { backend } = makeBackend({}, { getOk: false, getStatus: 404 });
      await expect(backend.get("https://dav.example.com/media/cat.png")).rejects.toThrow("WebDAV GET failed: 404");
    });
  });

  describe("delete", () => {
    it("resolves when req.delete returns ok", async () => {
      const { backend } = makeBackend({}, { deleteOk: true });
      await expect(backend.delete("https://dav.example.com/media/cat.png")).resolves.toBeUndefined();
    });
    it("throws with status when req.delete returns not ok", async () => {
      const { backend } = makeBackend({}, { deleteOk: false, deleteStatus: 403 });
      await expect(backend.delete("https://dav.example.com/media/cat.png")).rejects.toThrow("WebDAV DELETE failed: 403");
    });
  });
});