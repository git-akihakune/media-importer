export type BackendId = "local" | "webdav" | "s3";

export interface MediaImporterSettings {
  scanPaths: string[];
  detectors: {
    mdImage: boolean;
    mdAv: boolean;
    wikilink: boolean;
    htmlImg: boolean;
    htmlAv: boolean;
  };
  allowlist: string[];
  denylist: string[];
  sizeLimitMB: number | null;
  activeBackend: BackendId;
  local: { folder: string | null };
  /**
   * WebDAV configuration. The password never lives here — it is stored in the
   * secret store under {@link SECRET_KEYS.webdavPassword} and merged in at
   * call time via {@link resolveBackendConfig}.
   */
  webdav: { baseURL: string; username: string; avoidOverwrite: boolean };
  /**
   * S3 configuration. The secret access key never lives here — it is stored
   * in the secret store under {@link SECRET_KEYS.s3SecretAccessKey} and
   * merged in at call time via {@link resolveBackendConfig}.
   */
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; keyPrefix: string; publicUrlTemplate: string };
  requestTimeoutSec: number;
}

export const DEFAULT_SETTINGS: MediaImporterSettings = {
  scanPaths: [],
  detectors: { mdImage: true, mdAv: true, wikilink: false, htmlImg: false, htmlAv: false },
  allowlist: ["*"],
  denylist: [],
  sizeLimitMB: null,
  activeBackend: "local",
  local: { folder: null },
  webdav: { baseURL: "", username: "", avoidOverwrite: false },
  s3: { endpoint: "", region: "", bucket: "", accessKeyId: "", keyPrefix: "", publicUrlTemplate: "" },
  requestTimeoutSec: 30,
};
