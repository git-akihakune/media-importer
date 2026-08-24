import { readFileSync, appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function readManifestInfo(manifestPath) {
  const manifest = JSON.parse(readFileSync(new URL(manifestPath, import.meta.url), "utf8"));
  if (!manifest.version || !manifest.minAppVersion) {
    throw new Error("manifest.json missing version or minAppVersion");
  }
  return { version: manifest.version, minAppVersion: manifest.minAppVersion };
}

export function writeOutputs(info, ghOutputPath) {
  const lines = [
    `version=${info.version}`,
    `min_app_version=${info.minAppVersion}`,
  ];
  if (ghOutputPath) {
    for (const line of lines) appendFileSync(ghOutputPath, line + "\n");
  } else {
    for (const line of lines) console.log(line);
  }
}

function main() {
  const info = readManifestInfo("../manifest.json");
  writeOutputs(info, process.env.GITHUB_OUTPUT);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}