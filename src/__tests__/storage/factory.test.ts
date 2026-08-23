import { describe, it, expect } from "vitest";
import { buildBackendFromSettings } from "../../storage/factory";
import { LocalStorageBackend } from "../../storage/local";
import { WebDAVBackend } from "../../storage/webdav";
import { S3Backend } from "../../storage/s3";
import { FakeVault } from "../helpers/fake-vault";
import { DEFAULT_SETTINGS } from "../../settings";

describe("buildBackendFromSettings", () => {
  const vault = new FakeVault([]);
  it("returns LocalStorageBackend for activeBackend=local", () => {
    const b = buildBackendFromSettings({ ...DEFAULT_SETTINGS, activeBackend: "local" }, vault);
    expect(b).toBeInstanceOf(LocalStorageBackend);
  });
  it("returns WebDAVBackend for activeBackend=webdav", () => {
    const b = buildBackendFromSettings({ ...DEFAULT_SETTINGS, activeBackend: "webdav" }, vault);
    expect(b).toBeInstanceOf(WebDAVBackend);
  });
  it("returns S3Backend for activeBackend=s3", () => {
    const s: typeof DEFAULT_SETTINGS = {
      ...DEFAULT_SETTINGS,
      activeBackend: "s3",
      s3: { ...DEFAULT_SETTINGS.s3, endpoint: "https://s3.example.com", region: "us-east-1", bucket: "media", accessKeyId: "k", secretAccessKey: "s" },
    };
    const b = buildBackendFromSettings(s, vault);
    expect(b).toBeInstanceOf(S3Backend);
  });
  it("throws on unknown backend id", () => {
    const s = { ...DEFAULT_SETTINGS, activeBackend: "bogus" as never };
    expect(() => buildBackendFromSettings(s, vault)).toThrow("Unknown backend: bogus");
  });
});