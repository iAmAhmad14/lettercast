import { expect, test } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";

import { chromium } from "@playwright/test";

import { readZipEntries } from "../../scripts/verify-release.mjs";

const releaseZip = process.env.LETTERCAST_RELEASE_ZIP;
const expectedExtensionId = process.env.LETTERCAST_EXPECTED_EXTENSION_ID;

test("the same release ZIP keeps one ID across two extraction paths", async () => {
  test.setTimeout(60_000);
  test.skip(
    releaseZip === undefined || expectedExtensionId === undefined,
    "Release-only identity evidence requires a ZIP and expected ID.",
  );

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "lettercast-identity-"));
  const expectedTemporaryPrefix = `${path.resolve(tmpdir())}${path.sep}`;
  if (!path.resolve(temporaryRoot).startsWith(expectedTemporaryPrefix)) {
    throw new Error("Refusing to use an unexpected temporary directory.");
  }

  try {
    const archive = await readFile(path.resolve(releaseZip));
    const entries = readZipEntries(archive);
    const observedIds = [];

    for (const label of ["first-location", "second-location"]) {
      const extensionDirectory = path.join(temporaryRoot, label, "lettercast");
      const profileDirectory = path.join(temporaryRoot, `${label}-profile`);
      for (const [name, contents] of entries) {
        const destination = path.join(extensionDirectory, ...name.split("/"));
        await mkdir(path.dirname(destination), { recursive: true });
        await writeFile(destination, contents);
      }

      const context = await chromium.launchPersistentContext(profileDirectory, {
        channel: "chromium",
        headless: true,
        args: [
          `--disable-extensions-except=${extensionDirectory}`,
          `--load-extension=${extensionDirectory}`,
        ],
        serviceWorkers: "allow",
      });
      try {
        const serviceWorker =
          context.serviceWorkers()[0] ??
          (await context.waitForEvent("serviceworker"));
        observedIds.push(new URL(serviceWorker.url()).host);
      } finally {
        await context.close();
      }
    }

    expect(observedIds).toEqual([
      expectedExtensionId,
      expectedExtensionId,
    ]);
  } finally {
    await rm(temporaryRoot, { recursive: true });
  }
});
