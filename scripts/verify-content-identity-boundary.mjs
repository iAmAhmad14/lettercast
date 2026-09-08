import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const source = await readFile(
  new URL("../apps/extension/src/content/page-identity.ts", import.meta.url),
  "utf8",
);

for (const prohibited of [
  /\bfetch\s*\(/iu,
  /XMLHttpRequest/iu,
  /MutationObserver/iu,
  /browser\.storage/iu,
  /localStorage/iu,
  /sessionStorage/iu,
  /indexedDB/iu,
  /document\.title/iu,
  /release[-_ ]?year/iu,
  /\/actor\//iu,
]) {
  if (prohibited.test(source)) {
    throw new Error(`Page identity code contains a prohibited fallback: ${prohibited}`);
  }
}

for (const required of [
  'data-track-action="TMDB"',
  "dataset.tmdbType",
  "dataset.tmdbId",
  'querySelectorAll("#tab-panel-cast")',
]) {
  if (!source.includes(required)) {
    throw new Error(`Page identity code is missing a required signal: ${required}`);
  }
}
