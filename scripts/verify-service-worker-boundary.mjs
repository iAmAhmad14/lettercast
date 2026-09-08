import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const files = [
  "../apps/extension/entrypoints/background.ts",
  "../apps/extension/src/service-worker/backend-client.ts",
  "../apps/extension/src/service-worker/message-handler.ts",
];
const sources = await Promise.all(
  files.map((file) => readFile(new URL(file, import.meta.url), "utf8")),
);
const combined = sources.join("\n");

for (const prohibited of [
  /browser\.storage/iu,
  /localStorage/iu,
  /sessionStorage/iu,
  /indexedDB/iu,
  /XMLHttpRequest/iu,
]) {
  if (prohibited.test(combined)) {
    throw new Error(`Service worker contains prohibited state or egress: ${prohibited}`);
  }
}

if (!sources[0]?.includes("browser.runtime.onMessage.addListener(handleMessage)")) {
  throw new Error("The runtime listener must be registered during background startup.");
}

if (!sources[1]?.includes("/v1/movie/${tmdbId}/cast")) {
  throw new Error("The backend client must use only the fixed cast route.");
}
