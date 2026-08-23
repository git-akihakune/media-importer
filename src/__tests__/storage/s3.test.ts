import { describe, it, expect, vi } from "vitest";
import { S3Backend, S3Config, S3Client } from "../../storage/s3";

const mockClient = (existing: Set<string>, opts: { bucketExists?: boolean; bucketExistsThrow?: string } = {}): S3Client => ({
  putObject: vi.fn(async (key: string, _buf: ArrayBuffer) => { existing.add(key); }),
  objectExists: vi.fn(async (key: string) => existing.has(key)),
  bucketExists: vi.fn(async () => {
    if (opts.bucketExistsThrow) throw new Error(opts.bucketExistsThrow);
    return opts.bucketExists ?? true;
  }),
});

const cfg: S3Config = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  bucket: "media",
  accessKeyId: "k",
  secretAccessKey: "s",
  keyPrefix: "notes",
  publicUrlTemplate: "https://cdn.example.com/media/{{key}}",
};

describe("S3Backend", () => {
  it("put uploads to bucket/prefix/name and renders publicUrlTemplate", async () => {
    const client = mockClient(new Set());
    const b = new S3Backend(cfg, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(client.putObject).toHaveBeenCalledWith("notes/cat.png", expect.any(ArrayBuffer));
    expect(url).toBe("https://cdn.example.com/media/notes/cat.png");
  });
  it("appends -N suffix on collision via objectExists", async () => {
    const client = mockClient(new Set(["notes/cat.png"]));
    const b = new S3Backend(cfg, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(url).toBe("https://cdn.example.com/media/notes/cat-1.png");
    expect(client.putObject).toHaveBeenCalledWith("notes/cat-1.png", expect.any(ArrayBuffer));
  });
  it("selfProduced matches publicUrlTemplate prefix", async () => {
    const b = new S3Backend(cfg, mockClient(new Set()));
    expect(b.selfProduced("https://cdn.example.com/media/notes/cat.png")).toBe(true);
    expect(b.selfProduced("https://other.com/notes/cat.png")).toBe(false);
  });
  it("falls back to endpoint/bucket/key when publicUrlTemplate is empty", async () => {
    const client = mockClient(new Set());
    const b = new S3Backend({ ...cfg, publicUrlTemplate: "" }, client);
    const url = await b.put(new ArrayBuffer(4), "cat.png");
    expect(url).toBe("https://s3.example.com/media/notes/cat.png");
  });

  describe("ping", () => {
    it("resolves when bucketExists returns true", async () => {
      const client = mockClient(new Set(), { bucketExists: true });
      const b = new S3Backend(cfg, client);
      await expect(b.ping()).resolves.toBeUndefined();
    });
    it("throws when bucketExists returns false", async () => {
      const client = mockClient(new Set(), { bucketExists: false });
      const b = new S3Backend(cfg, client);
      await expect(b.ping()).rejects.toThrow('S3: bucket "media" not found or no access — check bucket/region/credentials');
    });
    it("wraps errors thrown by bucketExists", async () => {
      const client = mockClient(new Set(), { bucketExistsThrow: "network unreachable" });
      const b = new S3Backend(cfg, client);
      await expect(b.ping()).rejects.toThrow("S3: network unreachable");
    });
  });
});