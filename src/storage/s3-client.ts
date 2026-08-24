import { Platform } from "obsidian";
import { S3Client } from "./s3";

/**
 * Node `crypto` types we need for SigV4. Loaded via a guarded dynamic
 * import (see {@link loadCrypto}) so the static bundle has no Node.js
 * builtin imports — only `obsidian` remains externalised. The plugin is
 * desktop-only, so the dynamic import is safe at runtime.
 */
type Crypto = typeof import("crypto");

let cryptoPromise: Promise<Crypto> | null = null;
function loadCrypto(): Promise<Crypto> {
  if (!Platform.isDesktop) throw new Error("S3 backend requires the desktop runtime");
  if (!cryptoPromise) {
    cryptoPromise = import("crypto");
  }
  return cryptoPromise;
}

/**
 * Minimal HTTP transport the {@link HttpRequestS3Client} signs against.
 * Mirrors the slice of Obsidian's `requestUrl` the client needs, so the
 * signing client is testable without Obsidian.
 */
export interface HttpExecutor {
  request(opts: {
    url: string;
    method: string;
    headers: Record<string, string>;
    body?: string | ArrayBuffer;
    throw?: boolean;
  }): Promise<{ status: number; headers: Record<string, string>; arrayBuffer: ArrayBuffer }>;
}

/**
 * AWS Signature V4 signer for a single S3 request. Pure: given the inputs
 * it returns the headers to send. Uses Node's `crypto` (loaded via a
 * guarded dynamic import) — no `fs`, `stream`, or `http` imports.
 */
async function signV4(crypto: Crypto, opts: {
  method: string;
  url: string;
  region: string;
  accessKey: string;
  secretKey: string;
  body: ArrayBuffer;
  contentType: string;
  extraHeaders?: Record<string, string>;
}): Promise<Record<string, string>> {
  const { method, url, region, accessKey, secretKey, body, contentType, extraHeaders } = opts;
  const u = new URL(url);
  const host = u.host;
  const path = u.pathname || "/";
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(crypto, body);

  const headers: Record<string, string> = {
    Host: host,
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    "content-type": contentType,
    ...extraHeaders,
  };

  const signedHeaderKeys = Object.keys(headers).map(k => k.toLowerCase()).sort();
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalHeaders = signedHeaderKeys
    .map(k => `${k}:${trimAll(headers[headerKeyFor(headers, k)])}\n`)
    .join("");

  const canonicalRequest = [
    method.toUpperCase(),
    encodeURI(path),
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(crypto, new TextEncoder().encode(canonicalRequest)),
  ].join("\n");

  const signingKey = deriveSigningKey(crypto, secretKey, dateStamp, region, "s3");
  const signature = hmacHex(crypto, signingKey, stringToSign);

  const authHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { ...headers, Authorization: authHeader };
}

function headerKeyFor(headers: Record<string, string>, lowerKey: string): string {
  const match = Object.keys(headers).find(k => k.toLowerCase() === lowerKey);
  return match ?? lowerKey;
}

function trimAll(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function sha256Hex(crypto: Crypto, data: ArrayBuffer | Uint8Array): string {
  const buf = data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function hmacHex(crypto: Crypto, key: Buffer | string, data: string): string {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest("hex");
}

function deriveSigningKey(crypto: Crypto, secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmacRaw(crypto, `AWS4${secretKey}`, dateStamp);
  const kRegion = hmacRaw(crypto, kDate, region);
  const kService = hmacRaw(crypto, kRegion, service);
  return hmacRaw(crypto, kService, "aws4_request");
}

function hmacRaw(crypto: Crypto, key: Buffer | string, data: string): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

/**
 * S3 client that talks to the REST API directly via {@link HttpExecutor},
 * signing each request with AWS Signature V4. Replaces the `minio` npm
 * package so the production bundle contains no `fs`/`stream`/`http`
 * imports (minio pulled those in through file-path overloads we never
 * used). {@link HttpExecutor} is injected so tests can mock transport;
 * production wires it to Obsidian's `requestUrl`.
 */
export class HttpRequestS3Client implements S3Client {
  constructor(
    private cfg: { endpoint: string; region: string; accessKey: string; secretKey: string },
    private bucket: string,
    private http: HttpExecutor,
  ) {}

  private endpointUrl(): string {
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    return `${base}/${this.bucket}`;
  }

  private objectUrl(key: string): string {
    return `${this.endpointUrl()}/${encodeURI(key)}`;
  }

  async putObject(key: string, buf: ArrayBuffer): Promise<void> {
    const crypto = await loadCrypto();
    const headers = await signV4(crypto, {
      method: "PUT",
      url: this.objectUrl(key),
      region: this.cfg.region,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      body: buf,
      contentType: "application/octet-stream",
    });
    const res = await this.http.request({ url: this.objectUrl(key), method: "PUT", headers, body: buf, throw: false });
    if (res.status < 200 || res.status >= 300) throw new Error(`S3 putObject failed: ${res.status}`);
  }

  async objectExists(key: string): Promise<boolean> {
    const crypto = await loadCrypto();
    const headers = await signV4(crypto, {
      method: "HEAD",
      url: this.objectUrl(key),
      region: this.cfg.region,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      body: new ArrayBuffer(0),
      contentType: "",
    });
    const res = await this.http.request({ url: this.objectUrl(key), method: "HEAD", headers, throw: false });
    return res.status >= 200 && res.status < 300;
  }

  async bucketExists(bucket: string): Promise<boolean> {
    const base = this.cfg.endpoint.replace(/\/+$/, "");
    const url = `${base}/${bucket}`;
    const crypto = await loadCrypto();
    const headers = await signV4(crypto, {
      method: "HEAD",
      url,
      region: this.cfg.region,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      body: new ArrayBuffer(0),
      contentType: "",
    });
    const res = await this.http.request({ url, method: "HEAD", headers, throw: false });
    return res.status >= 200 && res.status < 400;
  }

  async getObject(key: string): Promise<ArrayBuffer> {
    const crypto = await loadCrypto();
    const headers = await signV4(crypto, {
      method: "GET",
      url: this.objectUrl(key),
      region: this.cfg.region,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      body: new ArrayBuffer(0),
      contentType: "",
    });
    const res = await this.http.request({ url: this.objectUrl(key), method: "GET", headers, throw: false });
    if (res.status < 200 || res.status >= 300) throw new Error(`S3 getObject failed: ${res.status}`);
    return res.arrayBuffer;
  }

  async removeObject(key: string): Promise<void> {
    const crypto = await loadCrypto();
    const headers = await signV4(crypto, {
      method: "DELETE",
      url: this.objectUrl(key),
      region: this.cfg.region,
      accessKey: this.cfg.accessKey,
      secretKey: this.cfg.secretKey,
      body: new ArrayBuffer(0),
      contentType: "",
    });
    const res = await this.http.request({ url: this.objectUrl(key), method: "DELETE", headers, throw: false });
    if (res.status < 200 || res.status >= 300) throw new Error(`S3 removeObject failed: ${res.status}`);
  }
}