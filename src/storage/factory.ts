import { Backend } from "./backend";
import { MediaImporterSettings } from "../settings";
import { VaultAdapter } from "../vault-adapter";
import { LocalStorageBackend } from "./local";
import { WebDAVBackend } from "./webdav";
import { S3Backend } from "./s3";
import { ObsidianWebDAVRequester, MinioS3Client } from "../obsidian-deps";

export function buildBackendFromSettings(settings: MediaImporterSettings, vault: VaultAdapter): Backend {
  switch (settings.activeBackend) {
    case "local": {
      const folder = settings.local.folder ?? "";
      return new LocalStorageBackend(vault, { folder });
    }
    case "webdav": {
      const req = new ObsidianWebDAVRequester();
      return new WebDAVBackend({ ...settings.webdav }, req);
    }
    case "s3": {
      const client = new MinioS3Client(
        {
          endPoint: settings.s3.endpoint,
          region: settings.s3.region,
          accessKey: settings.s3.accessKeyId,
          secretKey: settings.s3.secretAccessKey,
        },
        settings.s3.bucket,
      );
      return new S3Backend({ ...settings.s3 }, client);
    }
    default:
      throw new Error(`Unknown backend: ${settings.activeBackend}`);
  }
}