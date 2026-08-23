import { Backend } from "./backend";
import { VaultAdapter } from "../vault-adapter";
import { collisionSuffix, joinVaultPath } from "../url";

export interface LocalStorageConfig {
  folder: string;
}

export class LocalStorageBackend implements Backend {
  constructor(private vault: VaultAdapter, private cfg: LocalStorageConfig) {}

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    const existing = await this.vault.listDir(this.cfg.folder);
    const final = collisionSuffix(name, new Set(existing));
    const path = joinVaultPath(this.cfg.folder, final);
    await this.vault.writeBinary(path, buf);
    return path;
  }

  async dryRunDest(name: string): Promise<string> {
    const existing = await this.vault.listDir(this.cfg.folder);
    const final = collisionSuffix(name, new Set(existing));
    return joinVaultPath(this.cfg.folder, final);
  }

  selfProduced(url: string): boolean {
    if (!url) return false;
    if (/^(https?:|app:|file:)/i.test(url)) return false;
    const folder = this.cfg.folder.replace(/^\/+|\/+$/g, "");
    return url.startsWith(folder + "/") || url === folder;
  }

  async ping(): Promise<void> {
    const folder = this.cfg.folder;
    if (!folder) return;
    if (!(await this.vault.exists(folder))) {
      throw new Error(`Local: folder "${folder}" not found in vault`);
    }
  }
}
