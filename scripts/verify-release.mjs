import { Buffer } from "node:buffer";
import { createHash, createPublicKey } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { inflateRawSync } from "node:zlib";

import { verifyManifest } from "./verify-manifest.mjs";

const PRODUCTION_BACKEND_ORIGIN =
  "https://lettercast-api.ahmad-713.workers.dev";
const EXPECTED_ZIP_NAME = "lettercast-1.0.0-chrome.zip";

function parseArguments(arguments_) {
  const options = {};
  for (let index = 0; index < arguments_.length; index += 2) {
    const name = arguments_[index];
    const value = arguments_[index + 1];
    if (!name?.startsWith("--") || value === undefined) {
      throw new Error("Release verifier arguments must be --name value pairs.");
    }
    options[name.slice(2)] = value;
  }
  if (!['pre-identity', 'stable-identity'].includes(options.stage)) {
    throw new Error("--stage must be pre-identity or stable-identity.");
  }
  if (options.zip === undefined || options.checksum === undefined) {
    throw new Error("--zip and --checksum are required.");
  }
  if (options.stage === "stable-identity" && options["expected-id"] === undefined) {
    throw new Error("Stable-identity verification requires --expected-id.");
  }
  return options;
}

function findEndOfCentralDirectory(archive) {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("ZIP end-of-central-directory record was not found.");
}

export function readZipEntries(archive) {
  const endOffset = findEndOfCentralDirectory(archive);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("ZIP central-directory entry is invalid.");
    }
    const method = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const uncompressedSize = archive.readUInt32LE(centralOffset + 24);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString("utf8");

    if (
      name.length === 0 ||
      name.includes("\\") ||
      name.startsWith("/") ||
      name.split("/").includes("..") ||
      entries.has(name)
    ) {
      throw new Error(`ZIP contains an unsafe or duplicate path: ${name}`);
    }
    if (archive.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new Error(`ZIP local header is invalid for ${name}.`);
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    const contents =
      method === 0
        ? compressed
        : method === 8
          ? inflateRawSync(compressed)
          : undefined;
    if (contents === undefined || contents.length !== uncompressedSize) {
      throw new Error(`ZIP compression or size is invalid for ${name}.`);
    }
    entries.set(name, contents);
    centralOffset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

export function deriveExtensionId(publicKey) {
  const der = Buffer.from(publicKey, "base64");
  createPublicKey({ key: der, format: "der", type: "spki" });
  const hexadecimal = createHash("sha256")
    .update(der)
    .digest("hex")
    .slice(0, 32);
  return [...hexadecimal]
    .map((character) => String.fromCharCode("a".charCodeAt(0) + Number.parseInt(character, 16)))
    .join("");
}

export async function verifyRelease(options) {
  const zipPath = path.resolve(options.zip);
  const expectedName =
    options.stage === "pre-identity"
      ? EXPECTED_ZIP_NAME.replace(".zip", "-pre-identity.zip")
      : EXPECTED_ZIP_NAME;
  if (path.basename(zipPath) !== expectedName) {
    throw new Error(`Expected ${expectedName} for ${options.stage} verification.`);
  }

  const archive = await readFile(zipPath);
  const entries = readZipEntries(archive);
  const allowedFiles = new Set([
    "manifest.json",
    "background.js",
    "content-scripts/content.js",
    "content-scripts/content.css",
    "icon/16.png",
    "icon/32.png",
    "icon/48.png",
    "icon/128.png",
  ]);
  for (const name of entries.keys()) {
    if (!allowedFiles.has(name)) {
      throw new Error(`ZIP contains an unexpected file: ${name}`);
    }
  }
  for (const name of allowedFiles) {
    if (!entries.has(name)) {
      throw new Error(`ZIP is missing required deployable file: ${name}`);
    }
  }

  const manifest = JSON.parse(entries.get("manifest.json").toString("utf8"));
  verifyManifest(manifest, {
    expectedBackendOrigin: PRODUCTION_BACKEND_ORIGIN,
    requirePublicKey: options.stage === "stable-identity",
    forbidPublicKey: options.stage === "pre-identity",
  });

  const prohibitedText = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/iu,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/u,
    /\b(?:CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CF_API_TOKEN|TMDB_API_TOKEN)\b\s*[:=]\s*["'`][^"'`\r\n]{8,}["'`]/iu,
    /(?:@vite\/client|import\.meta\.hot|localhost:\d+|127\.0\.0\.1:\d+)/iu,
  ];
  for (const [name, contents] of entries) {
    if (contents.includes(0)) continue;
    const source = contents.toString("utf8");
    if (prohibitedText.some((pattern) => pattern.test(source))) {
      throw new Error(
        `ZIP contains prohibited secret or development material in ${name}.`,
      );
    }
  }

  let extensionId = "not-applicable";
  if (options.stage === "stable-identity") {
    extensionId = deriveExtensionId(manifest.key);
    if (extensionId !== options["expected-id"]) {
      throw new Error("Public-key-derived extension ID does not match --expected-id.");
    }
  }

  const digest = createHash("sha256").update(archive).digest("hex");
  const checksumPath = path.resolve(options.checksum);
  await writeFile(checksumPath, `${digest}  ${path.basename(zipPath)}\n`, "utf8");
  return { digest, extensionId, entries };
}

const isCli =
  process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;
if (isCli) {
  const options = parseArguments(process.argv.slice(2));
  const { digest, extensionId } = await verifyRelease(options);
  process.stdout.write(
    `Release verification passed: stage=${options.stage} id=${extensionId} sha256=${digest}\n`,
  );
}
