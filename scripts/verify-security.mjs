import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadManifest, verifyManifest } from "./verify-manifest.mjs";

const execFileAsync = promisify(execFile);

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(
  repositoryRoot,
  "apps/extension/.output/chrome-mv3/manifest.json",
);

const manifest = await loadManifest(manifestPath);
const expectedBackendOrigin = process.env.LETTERCAST_EXPECTED_BACKEND_ORIGIN;
verifyManifest(manifest, {
  expectedBackendOrigin,
  requirePublicKey:
    process.env.LETTERCAST_ALLOW_MISSING_MANIFEST_KEY !== "1",
});

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesUnder(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

const sourceDirectories = [
  "apps/extension/entrypoints",
  "apps/extension/src",
  "apps/worker/src",
  "packages/contracts/src",
  "apps/extension/.output/chrome-mv3",
  "apps/worker/dist",
].map((directory) => path.join(repositoryRoot, directory));

const scannedFiles = (
  await Promise.all(sourceDirectories.map((directory) => filesUnder(directory)))
)
  .flat()
  .filter(
    (file) =>
      !file.endsWith("worker-configuration.d.ts") &&
      !file.endsWith(".test.ts"),
);

const { stdout: trackedOutput } = await execFileAsync(
  "git",
  ["ls-files", "-z"],
  { cwd: repositoryRoot, encoding: "buffer", maxBuffer: 10 * 1024 * 1024 },
);
const trackedFiles = trackedOutput
  .toString("utf8")
  .split("\0")
  .filter(Boolean)
  .map((file) => path.join(repositoryRoot, file));

const allowedCredentialExamples = new Set([
  "apps/extension/.env.e2e",
  "apps/worker/.dev.vars.example",
]);
const sensitiveFilename =
  /(^|\/)(?:\.env(?:\..+)?|\.dev\.vars(?:\..+)?|[^/]*(?:credential|private[-_]?key)[^/]*|[^/]+\.(?:pem|key|p8|pk8|p12|pfx|crx))$/iu;
for (const file of trackedFiles) {
  const relativeFile = path.relative(repositoryRoot, file).replaceAll("\\", "/");
  if (
    sensitiveFilename.test(relativeFile) &&
    !allowedCredentialExamples.has(relativeFile)
  ) {
    throw new Error(`Tracked sensitive file is not allowed: ${relativeFile}`);
  }
}

const filesToScan = [...new Set([...trackedFiles, ...scannedFiles])];
const contents = await Promise.all(
  filesToScan.map(async (file) => {
    const source = await readFile(file);
    return {
      file,
      source: source.includes(0) ? "" : source.toString("utf8"),
    };
  }),
);

const prohibitedCode = [
  { name: "eval", pattern: /\beval\s*\(/iu },
  { name: "new Function", pattern: /new\s+Function\b/iu },
  {
    name: "remote script creation",
    pattern: /createElement\s*\(\s*["']script["']\s*\)/iu,
  },
  {
    name: "analytics or telemetry vendor",
    pattern: /google-analytics|googletagmanager|mixpanel|segment\.io|amplitude|sentry\.io/iu,
  },
  { name: "embedded JWT-like secret", pattern: /\beyJ[A-Za-z0-9_-]{20,}\./u },
  { name: "TMDB API query credential", pattern: /[?&]api_key=/iu },
  { name: "unapproved TMDB endpoint", pattern: /\/3\/(?:tv|search|person)\//iu },
  {
    name: "private signing key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
  },
];

const codeFiles = new Set(scannedFiles);
for (const { file, source } of contents) {
  if (!codeFiles.has(file)) continue;
  for (const prohibited of prohibitedCode) {
    if (prohibited.pattern.test(source)) {
      throw new Error(
        `${path.relative(repositoryRoot, file)} contains ${prohibited.name}.`,
      );
    }
  }
}

const secretAssignment =
  /\b(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CF_API_TOKEN|TMDB_API_TOKEN|CLIENT_SECRET|PRIVATE_KEY)\b\s*[:=]\s*["'`](?<value>[^"'`\r\n]+)["'`]/giu;
const placeholderValue =
  /(?:replace|placeholder|example|dummy|fake|mock|test|fixture|your[-_]|redacted|not[-_]?set)/iu;
for (const { file, source } of contents) {
  for (const match of source.matchAll(secretAssignment)) {
    const value = match.groups?.value.trim() ?? "";
    if (value.length >= 8 && !placeholderValue.test(value)) {
      throw new Error(
        `${path.relative(repositoryRoot, file)} contains a likely embedded secret value.`,
      );
    }
  }
}

const tmdbClient = await readFile(
  path.join(repositoryRoot, "apps/worker/src/tmdb-client.ts"),
  "utf8",
);
if (
  !tmdbClient.includes("https://api.themoviedb.org") ||
  !tmdbClient.includes("/3/movie/${tmdbId}/credits")
) {
  throw new Error("Worker must retain only the approved TMDB movie credits endpoint.");
}

const workerConfig = await readFile(
  path.join(repositoryRoot, "apps/worker/wrangler.jsonc"),
  "utf8",
);
if (/TMDB_API_TOKEN/iu.test(workerConfig)) {
  throw new Error("TMDB_API_TOKEN must be a Wrangler secret, not configuration text.");
}

const originPolicy = await readFile(
  path.join(repositoryRoot, "apps/worker/src/origin-policy.ts"),
  "utf8",
);
const responses = await readFile(
  path.join(repositoryRoot, "apps/worker/src/responses.ts"),
  "utf8",
);
if (
  !originPolicy.includes("requestOrigin !== allowedExtensionOrigin") ||
  /Access-Control-Allow-Origin["'`,\s:]*(?:["'`])?\*/iu.test(responses)
) {
  throw new Error("Worker must retain exact-origin CORS without a wildcard.");
}

process.stdout.write(
  `Security verification passed for ${filesToScan.length} tracked/source/build files and the production manifest.\n`,
);
