import { describe, it, expect, vi } from "vitest";
import { WebDAVBackend } from "../../storage/webdav";

const makeBackend = (puts: Record<string, ArrayBuffer>, opts: { avoidOverwrite?: boolean } = {}) => {
  const putFn = vi.fn(async (url: string, buf: ArrayBuffer) => {
    puts[url] = buf;
    return { ok: true, status: 201 };
  });
  const headFn = vi.fn(async (url: string) => ({ exists: url in puts }));
  return {
    backend: new WebDAVBackend(
      { baseURL: "https://dav.example.com/media/", username: "u", password: "p", avoidOverwrite: opts.avoidOverwrite ?? false },
      { put: putFn, head: headFn },
    ),
    putFn,
    headFn,
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
});