export interface Backend {
  put(buf: ArrayBuffer, name: string): Promise<string>;
  selfProduced(url: string): boolean;
}

export type BackendId = "local" | "webdav" | "s3";

export interface BackendFactory {
  id: BackendId;
  name: string;
}