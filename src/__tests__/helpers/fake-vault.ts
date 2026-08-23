import { VaultAdapter } from "../../vault-adapter";

export class FakeVault implements VaultAdapter {
  binaries = new Map<string, ArrayBuffer>();
  constructor(public files: { path: string; content: string }[]) {}

  async listMarkdownFiles(paths: string[]): Promise<string[]> {
    if (paths.length === 0) return this.files.map(f => f.path);
    return this.files
      .filter(f => paths.some(p => f.path.startsWith(p.replace(/\/$/, "") + "/") || f.path === p))
      .map(f => f.path);
  }
  async read(path: string): Promise<string> {
    const f = this.files.find(f => f.path === path);
    if (!f) throw new Error(`FakeVault: file not found: ${path}`);
    return f.content;
  }
  async writeBinary(path: string, data: ArrayBuffer): Promise<void> {
    this.binaries.set(path, data);
  }
  async exists(path: string): Promise<boolean> {
    if (this.binaries.has(path)) return true;
    return this.files.some(f => f.path === path);
  }
  async listDir(path: string): Promise<string[]> {
    const prefix = path.endsWith("/") ? path : path + "/";
    const names = new Set<string>();
    for (const f of this.files) {
      if (f.path === path || f.path.startsWith(prefix)) {
        const rest = f.path === path ? "" : f.path.slice(prefix.length);
        const base = rest.split("/")[0];
        if (base) names.add(base);
      }
    }
    for (const key of this.binaries.keys()) {
      if (key === path || key.startsWith(prefix)) {
        const rest = key === path ? "" : key.slice(prefix.length);
        const base = rest.split("/")[0];
        if (base) names.add(base);
      }
    }
    return [...names];
  }
  async modifyText(path: string, content: string): Promise<void> {
    const f = this.files.find(f => f.path === path);
    if (f) {
      f.content = content;
    } else {
      this.files.push({ path, content });
    }
  }
  async readBinary(path: string): Promise<ArrayBuffer> {
    const buf = this.binaries.get(path);
    if (buf) return buf;
    throw new Error(`FakeVault: binary not found: ${path}`);
  }
  async delete(path: string): Promise<void> {
    this.binaries.delete(path);
    const idx = this.files.findIndex(f => f.path === path);
    if (idx >= 0) this.files.splice(idx, 1);
  }
}