import { describe, it, expect } from "vitest";
import { LocalStorageBackend } from "../../storage/local";
import { FakeVault } from "../helpers/fake-vault";

describe("LocalStorageBackend", () => {
  it("put writes to media folder and returns vault path", async () => {
    const vault = new FakeVault([]);
    const b = new LocalStorageBackend(vault, { folder: "media" });
    const url = await b.put(new ArrayBuffer(8), "cat.png");
    expect(url).toBe("media/cat.png");
    expect(await vault.exists("media/cat.png")).toBe(true);
  });
  it("appends -N suffix on collision", async () => {
    const vault = new FakeVault([{ path: "media/cat.png", content: "" }]);
    const b = new LocalStorageBackend(vault, { folder: "media" });
    expect(await b.put(new ArrayBuffer(8), "cat.png")).toBe("media/cat-1.png");
  });
  it("selfProduced matches own folder paths", async () => {
    const b = new LocalStorageBackend(new FakeVault([]), { folder: "media" });
    expect(b.selfProduced("media/cat.png")).toBe(true);
    expect(b.selfProduced("https://example.com/cat.png")).toBe(false);
  });

  describe("ping", () => {
    it("resolves when folder is empty (default attachment folder)", async () => {
      const b = new LocalStorageBackend(new FakeVault([]), { folder: "" });
      await expect(b.ping()).resolves.toBeUndefined();
    });
    it("resolves when configured folder exists in vault", async () => {
      const vault = new FakeVault([{ path: "media", content: "" }]);
      const b = new LocalStorageBackend(vault, { folder: "media" });
      await expect(b.ping()).resolves.toBeUndefined();
    });
    it("throws when configured folder is missing from vault", async () => {
      const b = new LocalStorageBackend(new FakeVault([]), { folder: "media" });
      await expect(b.ping()).rejects.toThrow('Local: folder "media" not found in vault');
    });
  });
});