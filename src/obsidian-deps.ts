import { App, Vault, TFile, requestUrl, RequestUrlParam } from "obsidian";
import { VaultAdapter } from "./vault-adapter";
import { FetchRequester } from "./downloader";
import { HeadRequester } from "./filter";
import { WebDAVRequester } from "./storage/webdav";
import { S3Client } from "./storage/s3";
import { HttpRequestS3Client, HttpExecutor } from "./storage/s3-client";
import { SecretStore, InMemorySecretStore } from "./secret-store";

// Electron's `safeStorage` is available in the desktop runtime but not at
// type-check/test time (it is provided by the host, not an npm dep).
// Importing it dynamically inside a runtime guard keeps the test bundle and
// `tsc --noEmit` happy while still using the real API in production.
type SafeStorage = {
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
  isEncryptionAvailable(): boolean;
};
type ElectronModule = { safeStorage: SafeStorage };
async function loadElectron(): Promise<ElectronModule | null> {
  try {
    const mod = await import("electron");
    const e = mod as unknown as ElectronModule;
    return e?.safeStorage ? e : null;
  } catch {
    return null;
  }
}

export class ObsidianVaultAdapter implements VaultAdapter {
  constructor(private vault: Vault, private attachmentFolderResolver: () => string) {}

  async listMarkdownFiles(scanPaths: string[]): Promise<string[]> {
    const all = this.vault.getMarkdownFiles();
    if (scanPaths.length === 0) return all.map((f: TFile) => f.path);
    const normalized = scanPaths.map(p => p.replace(/\/+$/, ""));
    return all
      .filter((f: TFile) => normalized.some(p => f.path === p || f.path.startsWith(p + "/")))
      .map((f: TFile) => f.path);
  }

  async read(path: string): Promise<string> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    return await this.vault.read(f);
  }

  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    const existing = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (existing) await this.vault.modifyBinary(existing, data);
    else await this.vault.createBinary(path, data);
  }

  async exists(path: string): Promise<boolean> {
    return this.vault.getAbstractFileByPath(path) !== null;
  }

  async listDir(path: string): Promise<string[]> {
    try {
      const result = await this.vault.adapter.list(path);
      return result.files.map((f: string) => f.split("/").pop()!).concat(result.folders.map((f: string) => f.split("/").pop()!));
    } catch {
      return [];
    }
  }

  async modifyText(path: string, content: string): Promise<void> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    await this.vault.modify(f, content);
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    return await this.vault.readBinary(f);
  }

  async delete(path: string): Promise<void> {
    const f = this.vault.getAbstractFileByPath(path) as TFile | null;
    if (!f) throw new Error(`file not found: ${path}`);
    await (this.vault as unknown as { trashFile: (f: TFile) => Promise<void> }).trashFile(f);
  }
}

export class ObsidianFetchRequester implements FetchRequester, HeadRequester {
  async fetch(url: string, _opts: { timeoutMs: number }) {
    const params: RequestUrlParam = { url, method: "GET" };
    try {
      const res = await requestUrl(params);
      return {
        ok: res.status >= 200 && res.status < 300,
        status: res.status,
        arrayBuffer: async () => res.arrayBuffer,
        contentType: res.headers["content-type"] ?? "",
      };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return {
        ok: false,
        status,
        arrayBuffer: async () => new ArrayBuffer(0),
        contentType: "",
      };
    }
  }

  async head(url: string) {
    try {
      const res = await requestUrl({ url, method: "HEAD" });
      const raw = res.headers["content-length"];
      const len = raw != null && raw !== "" ? Number(raw) : NaN;
      return { contentLength: Number.isFinite(len) ? len : null };
    } catch {
      return { contentLength: null };
    }
  }
}

export class ObsidianWebDAVRequester implements WebDAVRequester {
  async put(url: string, buf: ArrayBuffer, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await requestUrl({
        url,
        method: "PUT",
        body: buf,
        headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) },
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return { ok: false, status };
    }
  }

  async head(url: string, auth: { username: string; password: string }): Promise<{ exists: boolean }> {
    try {
      const res = await requestUrl({
        url,
        method: "HEAD",
        headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) },
      });
      return { exists: res.status >= 200 && res.status < 400 };
    } catch {
      return { exists: false };
    }
  }

  async test(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await requestUrl({
        url,
        method: "PROPFIND",
        headers: {
          Authorization: "Basic " + base64(`${auth.username}:${auth.password}`),
          Depth: "0",
        },
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return { ok: false, status };
    }
  }

  async get(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number; arrayBuffer: ArrayBuffer }> {
    try {
      const res = await requestUrl({
        url,
        method: "GET",
        headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) },
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status, arrayBuffer: res.arrayBuffer };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return { ok: false, status, arrayBuffer: new ArrayBuffer(0) };
    }
  }

  async delete(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await requestUrl({
        url,
        method: "DELETE",
        headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) },
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return { ok: false, status };
    }
  }

  async mkcol(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }> {
    try {
      const res = await requestUrl({
        url,
        method: "MKCOL",
        headers: { Authorization: "Basic " + base64(`${auth.username}:${auth.password}`) },
      });
      return { ok: res.status >= 200 && res.status < 300, status: res.status };
    } catch (e: unknown) {
      const status = (e as { status?: number })?.status ?? 0;
      return { ok: false, status };
    }
  }
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

/**
 * {@link HttpExecutor} backed by Obsidian's `requestUrl`. Used by
 * {@link HttpRequestS3Client} for S3 REST calls so the production bundle
 * contains no `fs`/`stream`/`http` imports (the `minio` package pulled
 * those in via file-path overloads we never used).
 */
export class ObsidianHttpExecutor implements HttpExecutor {
  async request(opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | ArrayBuffer;
    throw?: boolean;
  }): Promise<{ status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer }> {
    const params: RequestUrlParam = {
      url: opts.url,
      method: opts.method,
      headers: opts.headers,
      body: opts.body,
      throw: false,
    };
    const res = await requestUrl(params);
    return { status: res.status, headers: res.headers, arrayBuffer: res.arrayBuffer };
  }
}

/**
 * S3 client constructor exported for {@link buildBackendFromSettings}.
 * Signs each request with AWS Signature V4 and sends it through
 * {@link ObsidianHttpExecutor} (Obsidian's `requestUrl`).
 */
export function createS3Client(
  cfg: { endpoint: string; region: string; accessKey: string; secretKey: string },
  bucket: string,
): S3Client {
  return new HttpRequestS3Client(cfg, bucket, new ObsidianHttpExecutor());
}

// ---------------------------------------------------------------------------
// Secret stores
// ---------------------------------------------------------------------------

/**
 * Adapter over Obsidian's OS-backed `app.secretStorage` (available 1.11.4+).
 * Synchronous storage ops are wrapped in Promises to satisfy the async
 * {@link SecretStore} interface and to keep the call sites uniform.
 */
export class ObsidianSecretStorage implements SecretStore {
  private storage: { setSecret(id: string, secret: string): void; getSecret(id: string): string | null; listSecrets(): string[] };

  constructor(app: App) {
    this.storage = (app as unknown as { secretStorage: { setSecret(id: string, secret: string): void; getSecret(id: string): string | null; listSecrets(): string[] } }).secretStorage;
    if (!this.storage) {
      throw new Error("ObsidianSecretStorage: app.secretStorage is not available on this Obsidian version");
    }
  }

  async set(id: string, value: string | null): Promise<void> {
    if (value == null || value === "") {
      // Obsidian's SecretStorage has no explicit delete; writing "" is the
      // documented way to clear a slot, and getSecret returns null for empty.
      this.storage.setSecret(id, "");
    } else {
      this.storage.setSecret(id, value);
    }
  }

  async get(id: string): Promise<string | null> {
    const v = this.storage.getSecret(id);
    return v && v !== "" ? v : null;
  }

  async list(): Promise<string[]> {
    return this.storage.listSecrets();
  }
}

/**
 * Adapter over Electron's `safeStorage`, used when Obsidian's
 * `secretStorage` is unavailable (Obsidian < 1.11.4). Secrets are encrypted
 * with an OS-backed key (DPAPI on Windows, Keychain on macOS, libsecret on
 * Linux) and persisted as base64 strings inside `data.json` under
 * `__secrets__`. The rest of `data.json` stays plaintext (non-secret
 * config); only the secret ciphertext lives here.
 *
 * When no OS keychain is available (`isEncryptionAvailable()` returns
 * false), encryption degrades to a reversible encoding. We still store it
 * (clearly marked) rather than refusing to operate, so the plugin remains
 * usable on minimal Linux setups without libsecret; this matches
 * Electron's own guidance. The Obsidian `SecretStorage` path is always
 * preferred when available.
 */
export class SafeStorageSecretStore implements SecretStore {
  private electron: ElectronModule;
  private bag: Map<string, string> = new Map();
  /** Whether the OS-backed keychain is actually available. */
  readonly encryptionAvailable: boolean;

  constructor(electron: ElectronModule, initial: Record<string, string> = {}) {
    this.electron = electron;
    this.encryptionAvailable = electron.safeStorage.isEncryptionAvailable();
    for (const [id, b64] of Object.entries(initial)) {
      if (b64) this.bag.set(id, b64);
    }
  }

  async set(id: string, value: string | null): Promise<void> {
    if (value == null || value === "") {
      this.bag.delete(id);
      return;
    }
    this.bag.set(id, this.encrypt(value));
  }

  async get(id: string): Promise<string | null> {
    const b64 = this.bag.get(id);
    if (!b64) return null;
    try {
      return this.decrypt(b64);
    } catch {
      // Ciphertext was produced with a different keychain/garbage; treat as absent.
      return null;
    }
  }

  async list(): Promise<string[]> {
    return [...this.bag.keys()];
  }

  /**
   * Snapshot the current secrets as base64 ciphertext for persistence.
   * Includes a `__encrypted` sentinel indicating whether OS-backed
   * encryption was actually available when the ciphertext was produced
   * (`"true"` / `"false"`). When false, the "ciphertext" is a reversible
   * encoding with a hardcoded key — consumers can surface a warning.
   */
  snapshot(): Record<string, string> {
    return { ...Object.fromEntries(this.bag), __encrypted: this.encryptionAvailable ? "true" : "false" };
  }

  private encrypt(plain: string): string {
    const buf = this.electron.safeStorage.encryptString(plain);
    return buf.toString("base64");
  }

  private decrypt(b64: string): string {
    const buf = Buffer.from(b64, "base64");
    return this.electron.safeStorage.decryptString(buf);
  }
}

/**
 * Decide which {@link SecretStore} to use at runtime, in priority order:
 *   1. Obsidian `app.secretStorage` (1.11.4+) — OS-backed, preferred.
 *   2. Electron `safeStorage` — encrypted-at-rest fallback.
 *   3. {@link InMemorySecretStore} — last resort (volatile, tests).
 *
 * When upgrading from Obsidian <1.11.4 (which used `SafeStorageSecretStore`)
 * to 1.11.4+ (which uses `ObsidianSecretStorage`), any secrets previously
 * encrypted in the `persistedSecrets` bag are decrypted and written to the
 * new Obsidian store before the bag is discarded. This prevents silent
 * credential loss on Obsidian upgrade.
 *
 * @param app Obsidian app instance, or `null` in test contexts.
 * @param persistedSecrets The `__secrets__` blob previously written by
 *   {@link SafeStorageSecretStore}, for restoring an existing
 *   `SafeStorageSecretStore` across reloads, or migrating to
 *   `ObsidianSecretStorage` on Obsidian upgrade. Ignored when the in-memory
 *   store is selected.
 */
export async function createSecretStore(
  app: App | null,
  persistedSecrets: Record<string, string> | null,
): Promise<SecretStore> {
  // 1. Obsidian native SecretStorage (1.11.4+).
  if (app) {
    const storage = (app as unknown as { secretStorage?: { setSecret(id: string, secret: string): void; getSecret(id: string): string | null; listSecrets(): string[] } }).secretStorage;
    if (storage && typeof storage.setSecret === "function") {
      const store = new ObsidianSecretStorage(app);
      // Store-switch migration: if a previous run used SafeStorageSecretStore
      // (Obsidian <1.11.4), decrypt the old ciphertext and write to the new
      // OS-backed store before the bag is discarded by dataToPersist.
      if (persistedSecrets && Object.keys(persistedSecrets).length > 0) {
        const electron = await loadElectron();
        if (electron) {
          const old = new SafeStorageSecretStore(electron, persistedSecrets);
          for (const id of await old.list()) {
            const val = await old.get(id);
            if (val) await store.set(id, val);
          }
        }
      }
      return store;
    }
  }

  // 2. Electron safeStorage.
  const electron = await loadElectron();
  if (electron) {
    return new SafeStorageSecretStore(electron, persistedSecrets ?? {});
  }

  // 3. In-memory fallback.
  return new InMemorySecretStore();
}