import { Vault, TFile, requestUrl, RequestUrlParam } from "obsidian";
import { VaultAdapter } from "./vault-adapter";
import { FetchRequester } from "./downloader";
import { HeadRequester } from "./filter";
import { WebDAVRequester } from "./storage/webdav";
import { S3Client } from "./storage/s3";
import { Client as MinioClient } from "minio";

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
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

export class MinioS3Client implements S3Client {
  private client: MinioClient;
  constructor(
    cfg: { endPoint: string; region: string; accessKey: string; secretKey: string; useSSL?: boolean },
    private bucket: string,
  ) {
    this.client = new MinioClient({
      endPoint: cfg.endPoint.replace(/^https?:\/\//, ""),
      region: cfg.region,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
      useSSL: cfg.useSSL ?? cfg.endPoint.startsWith("https"),
    });
  }
  async putObject(key: string, buf: ArrayBuffer): Promise<void> {
    await this.client.putObject(this.bucket, key, Buffer.from(buf));
  }
  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.statObject(this.bucket, key);
      return true;
    } catch {
      return false;
    }
  }
}