import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const manifestUrl = new URL(
  "../apps/extension/.output/chrome-mv3/manifest.json",
  import.meta.url,
);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

if (manifest.manifest_version !== 3) {
  throw new Error(
    `Expected a Manifest V3 extension, received ${String(manifest.manifest_version)}`,
  );
}
