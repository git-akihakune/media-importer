import { Backend } from "./backend";
import { collisionSuffix } from "../url";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  keyPrefix: string;
  publicUrlTemplate: string;
}

export interface S3Client {
  putObject(key: string, buf: ArrayBuffer): Promise<void>;
  objectExists(key: string): Promise<boolean>;
  bucketExists(bucket: string): Promise<boolean>;
}

export class S3Backend implements Backend {
  constructor(private cfg: S3Config, private client: S3Client) {}

  private prefix(): string {
    return this.cfg.keyPrefix.replace(/^\/+|\/+$/g, "");
  }

  private renderPublicURL(key: string): string {
    if (this.cfg.publicUrlTemplate) {
      return this.cfg.publicUrlTemplate.replace("{{key}}", key);
    }
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    return `${base}/${this.cfg.bucket}/${key}`;
  }

  async put(buf: ArrayBuffer, name: string): Promise<string> {
    const existing = new Set<string>();
    let candidate = name;
    while (await this.client.objectExists(this.fullKey(candidate))) {
      existing.add(candidate);
      candidate = collisionSuffix(name, existing);
    }
    const key = this.fullKey(candidate);
    await this.client.putObject(key, buf);
    return this.renderPublicURL(key);
  }

  async dryRunDest(name: string): Promise<string> {
    const existing = new Set<string>();
    let candidate = name;
    while (await this.client.objectExists(this.fullKey(candidate))) {
      existing.add(candidate);
      candidate = collisionSuffix(name, existing);
    }
    return this.renderPublicURL(this.fullKey(candidate));
  }

  private fullKey(name: string): string {
    const p = this.prefix();
    return p ? `${p}/${name}` : name;
  }

  selfProduced(url: string): boolean {
    if (!this.cfg.publicUrlTemplate) {
      return url.startsWith(`${this.cfg.endpoint.replace(/\/+$/, "")}/${this.cfg.bucket}/`);
    }
    const prefix = this.cfg.publicUrlTemplate.split("{{key}}")[0];
    return url.startsWith(prefix);
  }

  async ping(): Promise<void> {
    try {
      const exists = await this.client.bucketExists(this.cfg.bucket);
      if (!exists) {
        throw new Error(`S3: bucket "${this.cfg.bucket}" not found or no access — check bucket/region/credentials`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("S3: ")) throw e;
      throw new Error(`S3: ${msg}`);
    }
  }
}
