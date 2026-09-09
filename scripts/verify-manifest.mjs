import { readFile } from "node:fs/promises";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { URL } from "node:url";

export const APPROVED_EXTENSION_NAME = "Lettercast";
export const APPROVED_EXTENSION_DESCRIPTION =
  "Enhances Letterboxd film pages with TMDB cast photos and character names.";
export const APPROVED_EXTENSION_VERSION = "1.0.0";

export const defaultManifestUrl = new URL(
  "../apps/extension/.output/chrome-mv3/manifest.json",
  import.meta.url,
);

export async function loadManifest(manifestLocation = defaultManifestUrl) {
  return JSON.parse(await readFile(manifestLocation, "utf8"));
}

export function verifyManifest(
  manifest,
  {
    expectedBackendOrigin,
    requirePublicKey = true,
    forbidPublicKey = false,
  } = {},
) {
  if (manifest.manifest_version !== 3) {
    throw new Error(
      `Expected Manifest V3, received ${String(manifest.manifest_version)}.`,
    );
  }
  if (
    manifest.name !== APPROVED_EXTENSION_NAME ||
    manifest.description !== APPROVED_EXTENSION_DESCRIPTION ||
    manifest.version !== APPROVED_EXTENSION_VERSION
  ) {
    throw new Error("Manifest release identity does not match the approved v1 values.");
  }

  const expectedIcons = {
    16: "icon/16.png",
    32: "icon/32.png",
    48: "icon/48.png",
    128: "icon/128.png",
  };
  if (JSON.stringify(manifest.icons) !== JSON.stringify(expectedIcons)) {
    throw new Error("Manifest does not contain the approved extension icon set.");
  }

  const contentScripts = manifest.content_scripts ?? [];
  if (
    contentScripts.length !== 1 ||
    JSON.stringify(contentScripts[0]?.matches) !==
      JSON.stringify(["https://letterboxd.com/film/*"]) ||
    contentScripts[0]?.run_at !== "document_idle"
  ) {
    throw new Error("Manifest does not have the narrow Letterboxd content-script boundary.");
  }

  const permissions = manifest.permissions ?? [];
  if (permissions.length !== 0) {
    throw new Error(`Manifest contains unapproved permissions: ${permissions.join(", ")}`);
  }

  const hostPermissions = manifest.host_permissions ?? [];
  if (hostPermissions.length > 1) {
    throw new Error("Manifest contains more than one backend host permission.");
  }
  for (const permission of hostPermissions) {
    if (
      !/^https:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\/\*$/u.test(permission) ||
      permission === "https://api.lettercast.test/*"
    ) {
      throw new Error(`Manifest contains an invalid host permission: ${permission}`);
    }
  }
  if (expectedBackendOrigin !== undefined) {
    const normalizedOrigin = new URL(expectedBackendOrigin).origin;
    if (
      expectedBackendOrigin !== normalizedOrigin ||
      JSON.stringify(hostPermissions) !==
        JSON.stringify([`${normalizedOrigin}/*`])
    ) {
      throw new Error("Manifest host permission does not match the expected backend origin.");
    }
  }

  const hasPublicKey =
    typeof manifest.key === "string" && manifest.key.length > 0;
  if (requirePublicKey && !hasPublicKey) {
    throw new Error("Manifest is missing the approved public key.");
  }
  if (forbidPublicKey && hasPublicKey) {
    throw new Error("Pre-identity manifest unexpectedly contains a public key.");
  }
}

const isCli =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (isCli) {
  const manifest = await loadManifest();
  verifyManifest(manifest, {
    expectedBackendOrigin: process.env.LETTERCAST_EXPECTED_BACKEND_ORIGIN,
    requirePublicKey:
      process.env.LETTERCAST_ALLOW_MISSING_MANIFEST_KEY !== "1",
  });
  process.stdout.write("Manifest verification passed.\n");
}
