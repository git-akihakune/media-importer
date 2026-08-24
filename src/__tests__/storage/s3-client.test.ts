import { describe, it, expect, vi } from "vitest";
import { HttpRequestS3Client, HttpExecutor } from "../../storage/s3-client";

const fakeHttp = (
  responses: Record<string, { status: number; arrayBuffer?: ArrayBuffer; headers?: Record<string, string> }>,
): HttpExecutor => ({
  request: vi.fn(async (opts) => {
    const key = `${opts.method} ${opts.url}`;
    const r = responses[key] ?? { status: 200, arrayBuffer: new ArrayBuffer(0) };
    return { status: r.status, headers: r.headers ?? {}, arrayBuffer: r.arrayBuffer ?? new ArrayBuffer(0) };
  }),
});

const cfg = {
  endpoint: "https://s3.example.com",
  region: "us-east-1",
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
};

describe("HttpRequestS3Client", () => {
  it("putObject sends a PUT with Authorization header and the body", async () => {
    const http = fakeHttp({ "PUT https://s3.example.com/media/cat.png": { status: 200 } });
    const client = new HttpRequestS3Client(cfg, "media", http);
    const buf = new ArrayBuffer(4);
    await client.putObject("cat.png", buf);
    const call = (http.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.method).toBe("PUT");
    expect(call.url).toBe("https://s3.example.com/media/cat.png");
    expect(call.body).toBe(buf);
    expect(call.headers["Authorization"]).toMatch(/^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/s3\/aws4_request, SignedHeaders=.+, Signature=[0-9a-f]{64}$/);
    expect(call.headers["x-amz-content-sha256"]).toMatch(/^[0-9a-f]{64}$/);
    expect(call.headers["x-amz-date"]).toMatch(/^\d{8}T\d{6}Z$/);
  });

  it("putObject throws on non-2xx", async () => {
    const http = fakeHttp({ "PUT https://s3.example.com/media/cat.png": { status: 403 } });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.putObject("cat.png", new ArrayBuffer(2))).rejects.toThrow("S3 putObject failed: 403");
  });

  it("objectExists returns true on 200, false on 404", async () => {
    const http = fakeHttp({
      "HEAD https://s3.example.com/media/cat.png": { status: 200 },
      "HEAD https://s3.example.com/media/dog.png": { status: 404 },
    });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.objectExists("cat.png")).resolves.toBe(true);
    await expect(client.objectExists("dog.png")).resolves.toBe(false);
  });

  it("bucketExists returns true on 200, false on 404", async () => {
    const http = fakeHttp({
      "HEAD https://s3.example.com/media": { status: 200 },
      "HEAD https://s3.example.com/missing": { status: 404 },
    });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.bucketExists("media")).resolves.toBe(true);
    await expect(client.bucketExists("missing")).resolves.toBe(false);
  });

  it("getObject returns the arrayBuffer on 200", async () => {
    const buf = new ArrayBuffer(8);
    const http = fakeHttp({ "GET https://s3.example.com/media/cat.png": { status: 200, arrayBuffer: buf } });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.getObject("cat.png")).resolves.toBe(buf);
  });

  it("getObject throws on non-2xx", async () => {
    const http = fakeHttp({ "GET https://s3.example.com/media/cat.png": { status: 500 } });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.getObject("cat.png")).rejects.toThrow("S3 getObject failed: 500");
  });

  it("removeObject sends DELETE and throws on non-2xx", async () => {
    const http = fakeHttp({
      "DELETE https://s3.example.com/media/cat.png": { status: 204 },
      "DELETE https://s3.example.com/media/dog.png": { status: 403 },
    });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await expect(client.removeObject("cat.png")).resolves.toBeUndefined();
    await expect(client.removeObject("dog.png")).rejects.toThrow("S3 removeObject failed: 403");
  });

  it("encodes object keys with special characters in the URL path", async () => {
    const http = fakeHttp({ "PUT https://s3.example.com/media/sub/cat%20pic.png": { status: 200 } });
    const client = new HttpRequestS3Client(cfg, "media", http);
    await client.putObject("sub/cat pic.png", new ArrayBuffer(1));
    const call = (http.request as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.url).toBe("https://s3.example.com/media/sub/cat%20pic.png");
  });

  it("signs with a unique signature per request body", async () => {
    const http = fakeHttp({
      "PUT https://s3.example.com/media/a.png": { status: 200 },
      "PUT https://s3.example.com/media/b.png": { status: 200 },
    });
    const client = new HttpRequestS3Client(cfg, "media", http);
    const buf1 = new ArrayBuffer(4);
    const buf2 = new ArrayBuffer(4);
    new Uint8Array(buf2)[0] = 1;
    await client.putObject("a.png", buf1);
    await client.putObject("b.png", buf2);
    const sig1 = (http.request as ReturnType<typeof vi.fn>).mock.calls[0][0].headers["Authorization"];
    const sig2 = (http.request as ReturnType<typeof vi.fn>).mock.calls[1][0].headers["Authorization"];
    expect(sig1).not.toBe(sig2);
  });
});