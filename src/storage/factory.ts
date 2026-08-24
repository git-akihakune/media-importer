import { Backend } from "./backend";
import { MediaImporterSettings } from "../settings";
import { VaultAdapter } from "../vault-adapter";
import { LocalStorageBackend } from "./local";
import { WebDAVBackend } from "./webdav";
import { S3Backend } from "./s3";
import { ObsidianWebDAVRequester, MinioS3Client } from "../obsidian-deps";
import { BackendConfig } from "../secrets";

/**
 * Build the active backend from non-secret settings plus the secret
 * values resolved at call time. The secret fields (`webdav.password`,
 * `s3.secretAccessKey`) are supplied via {@link cfg} and never read from
 * `settings`; {@link resolveBackendConfig} is the single place that merges
 * the two streams.
 */
export function buildBackendFromSettings(
  settings: MediaImporterSettings,
  cfg: BackendConfig,
  vault: VaultAdapter,
): Backend {
  switch (settings.activeBackend) {
    case "local": {
      const folder = settings.local.folder ?? "";
      return new LocalStorageBackend(vault, { folder });
    }
    case "webdav": {
      const req = new ObsidianWebDAVRequester();
      return new WebDAVBackend(cfg.webdav, req);
    }
    case "s3": {
      const client = new MinioS3Client(
        {
          endPoint: cfg.s3.endpoint,
          region: cfg.s3.region,
          accessKey: cfg.s3.accessKeyId,
          secretKey: cfg.s3.secretAccessKey,
        },
        cfg.s3.bucket,
      );
      return new S3Backend(cfg.s3, client);
    }
    default:
      throw new Error(`Unknown backend: ${settings.activeBackend}`);
  }
}