import { RunContext } from "./types";

export interface FetchRequester {
  fetch(url: string, opts: { timeoutMs: number }): Promise<{
    ok: boolean;
    status: number;
    arrayBuffer: () => Promise<ArrayBuffer>;
    contentType: string;
  }>;
}

export interface DownloaderConfig {
  timeoutMs: number;
}

export interface FetchResult {
  dryRun: boolean;
  buf: ArrayBuffer;
  contentType: string;
}

export class Downloader {
  constructor(private req: FetchRequester, private cfg: DownloaderConfig) {}

  async fetch(url: string, ctx: RunContext): Promise<FetchResult | null> {
    if (ctx.dryRun) {
      return { dryRun: true, buf: new ArrayBuffer(0), contentType: "" };
    }
    try {
      const res = await this.req.fetch(url, { timeoutMs: this.cfg.timeoutMs });
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      return { dryRun: false, buf, contentType: res.contentType };
    } catch {
      return null;
    }
  }
}