import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifestPath = path.join(
  repositoryRoot,
  "apps/extension/.output/chrome-mv3/manifest.json",
);

const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const contentScripts = manifest.content_scripts ?? [];
if (
  manifest.manifest_version !== 3 ||
  contentScripts.length !== 1 ||
  JSON.stringify(contentScripts[0]?.matches) !==
    JSON.stringify(["https://letterboxd.com/film/*"]) ||
  contentScripts[0]?.run_at !== "document_idle"
) {
  throw new Error("Production manifest does not have the narrow MV3 content-script boundary.");
}

const prohibitedPermissions = new Set(["cookies", "tabs", "storage"]);
const permissions = manifest.permissions ?? [];
for (const permission of permissions) {
  if (prohibitedPermissions.has(permission)) {
    throw new Error(`Production manifest contains prohibited permission: ${permission}`);
  }
}
if (permissions.length !== 0) {
  throw new Error(`Production manifest contains an unapproved permission: ${permissions.join(", ")}`);
}

const hostPermissions = manifest.host_permissions ?? [];
if (hostPermissions.length > 1) {
  throw new Error("Production manifest contains more than one backend host permission.");
}
for (const permission of hostPermissions) {
  if (
    !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/\*$/u.test(permission) ||
    permission === "https://api.lettercast.test/*"
  ) {
    throw new Error(`Production manifest contains an invalid host permission: ${permission}`);
  }
}

const expectedBackendOrigin = process.env.LETTERCAST_EXPECTED_BACKEND_ORIGIN;
if (expectedBackendOrigin !== undefined) {
  const expectedPermission = `${new URL(expectedBackendOrigin).origin}/*`;
  if (
    expectedBackendOrigin !== new URL(expectedBackendOrigin).origin ||
    JSON.stringify(hostPermissions) !== JSON.stringify([expectedPermission])
  ) {
    throw new Error("Production host permission does not match the expected backend origin.");
  }
}

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
const contents = await Promise.all(
  scannedFiles.map(async (file) => ({
    file,
    source: await readFile(file, "utf8"),
  })),
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
];

for (const { file, source } of contents) {
  for (const prohibited of prohibitedCode) {
    if (prohibited.pattern.test(source)) {
      throw new Error(
        `${path.relative(repositoryRoot, file)} contains ${prohibited.name}.`,
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

process.stdout.write(
  `Security verification passed for ${scannedFiles.length} source/build files and the production manifest.\n`,
);
