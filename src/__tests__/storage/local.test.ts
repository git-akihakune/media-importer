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
});