import { describe, it, expect } from "vitest";
import { InMemorySecretStore } from "../secret-store";
import {
  SECRET_KEYS,
  DEFAULT_SECRETS,
  loadSecrets,
  migratePlaintextSecrets,
  resolveBackendConfig,
} from "../secrets";
import { DEFAULT_SETTINGS } from "../settings";

describe("loadSecrets", () => {
  it("returns empty strings when the store is empty", async () => {
    const secrets = await loadSecrets(new InMemorySecretStore());
    expect(secrets).toEqual(DEFAULT_SECRETS);
  });

  it("returns the stored values", async () => {
    const store = new InMemorySecretStore();
    await store.set(SECRET_KEYS.webdavPassword, "hunter2");
    await store.set(SECRET_KEYS.s3SecretAccessKey, "sekret");
    const secrets = await loadSecrets(store);
    expect(secrets).toEqual({ webdavPassword: "hunter2", s3SecretAccessKey: "sekret" });
  });

  it("coalesces missing slots to empty strings", async () => {
    const store = new InMemorySecretStore();
    await store.set(SECRET_KEYS.webdavPassword, "hunter2");
    const secrets = await loadSecrets(store);
    expect(secrets.webdavPassword).toBe("hunter2");
    expect(secrets.s3SecretAccessKey).toBe("");
  });
});

describe("migratePlaintextSecrets", () => {
  it("moves webdav.password into the secret store and blanks the field", async () => {
    const store = new InMemorySecretStore();
    const data = { webdav: { baseURL: "https://dav", username: "u", password: "p", avoidOverwrite: false } };
    const result = await migratePlaintextSecrets(data, store);
    expect(result.migrated).toBe(true);
    expect(await store.get(SECRET_KEYS.webdavPassword)).toBe("p");
    expect((result.data.webdav as { password: string }).password).toBe("");
  });

  it("moves s3.secretAccessKey into the secret store and blanks the field", async () => {
    const store = new InMemorySecretStore();
    const data = { s3: { endpoint: "https://s3", region: "us", bucket: "b", accessKeyId: "k", secretAccessKey: "s", keyPrefix: "", publicUrlTemplate: "" } };
    const result = await migratePlaintextSecrets(data, store);
    expect(result.migrated).toBe(true);
    expect(await store.get(SECRET_KEYS.s3SecretAccessKey)).toBe("s");
    expect((result.data.s3 as { secretAccessKey: string }).secretAccessKey).toBe("");
  });

  it("migrates both secrets in one call", async () => {
    const store = new InMemorySecretStore();
    const data = {
      webdav: { password: "wp" },
      s3: { secretAccessKey: "ss" },
    };
    const result = await migratePlaintextSecrets(data, store);
    expect(result.migrated).toBe(true);
    expect(await store.get(SECRET_KEYS.webdavPassword)).toBe("wp");
    expect(await store.get(SECRET_KEYS.s3SecretAccessKey)).toBe("ss");
  });

  it("is a no-op when there are no plaintext secrets", async () => {
    const store = new InMemorySecretStore();
    const data = { webdav: { baseURL: "https://dav" }, s3: { endpoint: "https://s3" } };
    const result = await migratePlaintextSecrets(data, store);
    expect(result.migrated).toBe(false);
    expect(result.data).toEqual(data);
  });

  it("keeps the store value when both plaintext and store slot are populated", async () => {
    const store = new InMemorySecretStore();
    await store.set(SECRET_KEYS.webdavPassword, "from-store");
    const data = { webdav: { password: "from-plaintext" } };
    const result = await migratePlaintextSecrets(data, store);
    expect(result.migrated).toBe(false);
    expect(await store.get(SECRET_KEYS.webdavPassword)).toBe("from-store");
    expect((result.data.webdav as { password: string }).password).toBe("");
  });

  it("preserves non-secret sibling fields on the webdav object", async () => {
    const store = new InMemorySecretStore();
    const data = { webdav: { baseURL: "https://dav", username: "u", password: "p", avoidOverwrite: true } };
    const result = await migratePlaintextSecrets(data, store);
    const webdav = result.data.webdav as { baseURL: string; username: string; password: string; avoidOverwrite: boolean };
    expect(webdav.baseURL).toBe("https://dav");
    expect(webdav.username).toBe("u");
    expect(webdav.avoidOverwrite).toBe(true);
    expect(webdav.password).toBe("");
  });

  it("preserves non-secret sibling fields on the s3 object", async () => {
    const store = new InMemorySecretStore();
    const data = { s3: { endpoint: "https://s3", region: "us", bucket: "b", accessKeyId: "k", secretAccessKey: "s", keyPrefix: "p", publicUrlTemplate: "t" } };
    const result = await migratePlaintextSecrets(data, store);
    const s3 = result.data.s3 as { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; keyPrefix: string; publicUrlTemplate: string };
    expect(s3.endpoint).toBe("https://s3");
    expect(s3.region).toBe("us");
    expect(s3.bucket).toBe("b");
    expect(s3.accessKeyId).toBe("k");
    expect(s3.keyPrefix).toBe("p");
    expect(s3.publicUrlTemplate).toBe("t");
    expect(s3.secretAccessKey).toBe("");
  });
});

describe("resolveBackendConfig", () => {
  it("merges webdav settings with the stored password", () => {
    const settings = { ...DEFAULT_SETTINGS, webdav: { baseURL: "https://dav", username: "u", avoidOverwrite: true } };
    const secrets = { webdavPassword: "hunter2", s3SecretAccessKey: "" };
    const cfg = resolveBackendConfig(settings, secrets);
    expect(cfg.webdav).toEqual({ baseURL: "https://dav", username: "u", password: "hunter2", avoidOverwrite: true });
  });

  it("merges s3 settings with the stored secret access key", () => {
    const settings = { ...DEFAULT_SETTINGS, s3: { endpoint: "https://s3", region: "us", bucket: "b", accessKeyId: "k", keyPrefix: "p", publicUrlTemplate: "t" } };
    const secrets = { webdavPassword: "", s3SecretAccessKey: "sekret" };
    const cfg = resolveBackendConfig(settings, secrets);
    expect(cfg.s3).toEqual({ endpoint: "https://s3", region: "us", bucket: "b", accessKeyId: "k", secretAccessKey: "sekret", keyPrefix: "p", publicUrlTemplate: "t" });
  });

  it("uses empty strings when no secret is configured", () => {
    const cfg = resolveBackendConfig(DEFAULT_SETTINGS, DEFAULT_SECRETS);
    expect(cfg.webdav.password).toBe("");
    expect(cfg.s3.secretAccessKey).toBe("");
  });
});