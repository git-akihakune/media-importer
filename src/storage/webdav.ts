import { Backend } from "./backend";
import { collisionSuffix } from "../url";

export interface WebDAVConfig {
  baseURL: string;
  username: string;
  password: string;
  avoidOverwrite: boolean;
}

export interface WebDAVRequester {
  put(url: string, buf: ArrayBuffer, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }>;
  head(url: string, auth: { username: string; password: string }): Promise<{ exists: boolean }>;
  test(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }>;
  get(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number; arrayBuffer: ArrayBuffer }>;
  delete(url: string, auth: { username: string; password: string }): Promise<{ ok: boolean; status: number }>;
}

export class WebDAVBackend implements Backend {
  constructor(private cfg: WebDAVConfig, private req: WebDAVRequester) {}

  private base(): string {
    return this.cfg.baseURL.endsWith("/") ? this.cfg.baseURL : this.cfg.baseURL + "/";
  }

  private auth() {
    return { username: this.cfg.username, password: this.cfg.password };
  }

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    let final = name;
    if (this.cfg.avoidOverwrite) {
      const existing = new Set<string>();
      let candidate = name;
      while ((await this.req.head(this.base() + candidate, this.auth())).exists) {
        existing.add(candidate);
        candidate = collisionSuffix(name, existing);
      }
      final = candidate;
    }
    const url = this.base() + final;
    await this.req.put(url, buf, this.auth());
    return url;
  }

  async dryRunDest(name: string): Promise<string> {
    if (!this.cfg.avoidOverwrite) return this.base() + name;
    const existing = new Set<string>();
    let candidate = name;
    while ((await this.req.head(this.base() + candidate, this.auth())).exists) {
      existing.add(candidate);
      candidate = collisionSuffix(name, existing);
    }
    return this.base() + candidate;
  }

  selfProduced(url: string): boolean {
    return url.startsWith(this.base());
  }

  async ping(): Promise<void> {
    const { ok, status } = await this.req.test(this.base(), this.auth());
    if (ok) return;
    if (status === 401) throw new Error("WebDAV: unauthorized — check username/password");
    if (status === 404) throw new Error("WebDAV: base URL not found — check baseURL");
    if (status === 0) throw new Error("WebDAV: cannot reach endpoint — check baseURL and network");
    throw new Error(`WebDAV: unexpected status ${status}`);
  }

  async get(url: string): Promise<ArrayBuffer> {
    const { ok, status, arrayBuffer } = await this.req.get(url, this.auth());
    if (!ok) throw new Error(`WebDAV GET failed: ${status}`);
    return arrayBuffer;
  }

  async delete(url: string): Promise<void> {
    const { ok, status } = await this.req.delete(url, this.auth());
    if (!ok) throw new Error(`WebDAV DELETE failed: ${status}`);
  }
}
