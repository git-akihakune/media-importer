import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * @param {string} text - current versions.json contents
 * @param {string} version
 * @param {string} minAppVersion
 * @returns {{ updated: boolean, text: string }}
 */
export function updateVersionsJson(text, version, minAppVersion) {
  const data = JSON.parse(text);
  if (data[version]) {
    return { updated: false, text };
  }
  data[version] = minAppVersion;
  return { updated: true, text: JSON.stringify(data, null, 2) + "\n" };
}

function main() {
  const version = process.env.VERSION;
  const minAppVersion = process.env.MIN_APP_VERSION;
  if (!version || !minAppVersion) {
    console.error("VERSION and MIN_APP_VERSION env vars required");
    process.exit(1);
  }
  const path = "versions.json";
  const result = updateVersionsJson(readFileSync(path, "utf8"), version, minAppVersion);
  if (result.updated) {
    writeFileSync(path, result.text);
    console.log(`Added ${version} -> ${minAppVersion} to versions.json`);
  } else {
    console.log(`versions.json already has ${version}, skipping`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}