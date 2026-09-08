import { readFile } from "node:fs/promises";
import { URL } from "node:url";

const sourceUrl = new URL("../apps/worker/src/rate-limiter.ts", import.meta.url);
const source = await readFile(sourceUrl, "utf8");
const prohibitedSources = [
  /\brequest\b/iu,
  /\bheaders?\b/iu,
  /\bcookies?\b/iu,
  /\bip(?:v[46])?\b/iu,
  /fingerprint/iu,
  /user[-_ ]?agent/iu,
  /client[-_ ]?id/iu,
];

if (!source.includes("`get-cast:${tmdbId}`")) {
  throw new Error("Rate-limit key must be exactly get-cast:{tmdbMovieId}.");
}

for (const prohibited of prohibitedSources) {
  if (prohibited.test(source)) {
    throw new Error(`Rate limiter contains prohibited key input: ${prohibited}`);
  }
}
