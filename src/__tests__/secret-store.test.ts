import { describe, it, expect } from "vitest";
import { InMemorySecretStore } from "../secret-store";

describe("InMemorySecretStore", () => {
  it("stores and retrieves a value", async () => {
    const store = new InMemorySecretStore();
    await store.set("k", "v");
    expect(await store.get("k")).toBe("v");
  });

  it("returns null for missing keys", async () => {
    const store = new InMemorySecretStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("set(null) removes the value", async () => {
    const store = new InMemorySecretStore();
    await store.set("k", "v");
    await store.set("k", null);
    expect(await store.get("k")).toBeNull();
  });

  it("set('') removes the value", async () => {
    const store = new InMemorySecretStore();
    await store.set("k", "v");
    await store.set("k", "");
    expect(await store.get("k")).toBeNull();
  });

  it("list returns all stored ids", async () => {
    const store = new InMemorySecretStore();
    await store.set("a", "1");
    await store.set("b", "2");
    expect(await store.list()).toEqual(["a", "b"]);
  });

  it("list is empty after removing all entries", async () => {
    const store = new InMemorySecretStore();
    await store.set("a", "1");
    await store.set("a", null);
    expect(await store.list()).toEqual([]);
  });
});