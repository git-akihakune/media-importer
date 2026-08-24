import { readFileSync, appendFileSync } from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const version = manifest.version;
const minAppVersion = manifest.minAppVersion;

if (!version || !minAppVersion) {
  console.error("manifest.json missing version or minAppVersion");
  process.exit(1);
}

function setOutput(key, value) {
  const line = `${key}=${value}`;
  const ghOutput = process.env.GITHUB_OUTPUT;
  if (ghOutput) {
    appendFileSync(ghOutput, line + "\n");
  } else {
    console.log(line);
  }
}

setOutput("version", version);
setOutput("min_app_version", minAppVersion);