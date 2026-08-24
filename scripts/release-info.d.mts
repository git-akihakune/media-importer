export function readManifestInfo(manifestPath: string): {
  version: string;
  minAppVersion: string;
};
export function writeOutputs(
  info: { version: string; minAppVersion: string },
  ghOutputPath?: string
): void;