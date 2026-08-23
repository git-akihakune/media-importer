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
  webdav: { baseURL: string; username: string; password: string; avoidOverwrite: boolean };
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string; keyPrefix: string; publicUrlTemplate: string };
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
  webdav: { baseURL: "", username: "", password: "", avoidOverwrite: false },
  s3: { endpoint: "", region: "", bucket: "", accessKeyId: "", secretAccessKey: "", keyPrefix: "", publicUrlTemplate: "" },
  requestTimeoutSec: 30,
};
