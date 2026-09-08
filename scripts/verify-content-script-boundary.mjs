import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const sources = await Promise.all(
  [
    "../apps/extension/entrypoints/content.ts",
    "../apps/extension/src/content/lifecycle.ts",
    "../apps/extension/src/content/page-identity.ts",
    "../apps/extension/src/content/cast-renderer.ts",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
);
const source = sources.join("\n");

for (const prohibited of [
  /\bfetch\s*\(/iu,
  /XMLHttpRequest/iu,
  /MutationObserver/iu,
  /browser\.storage/iu,
  /chrome\.storage/iu,
  /localStorage/iu,
  /sessionStorage/iu,
  /indexedDB/iu,
  /\beval\s*\(/iu,
  /new\s+Function\b/iu,
]) {
  if (prohibited.test(source)) {
    throw new Error(`Content-script code contains a prohibited API: ${prohibited}`);
  }
}

const entrypoint = sources[0];
for (const required of [
  'matches: ["https://letterboxd.com/film/*"]',
  'runAt: "document_idle"',
  "browser.runtime.sendMessage(request)",
]) {
  if (!entrypoint.includes(required)) {
    throw new Error(`Content entrypoint is missing a required boundary: ${required}`);
  }
}
