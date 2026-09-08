import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  chromium,
  expect,
  type BrowserContext,
  type Route,
  test,
} from "@playwright/test";

const repositoryRoot = process.cwd();
const extensionPath = path.join(
  repositoryRoot,
  "apps/extension/.output/chrome-mv3-e2e",
);
const productionManifestPath = path.join(
  repositoryRoot,
  "apps/extension/.output/chrome-mv3/manifest.json",
);
const e2eManifestPath = path.join(extensionPath, "manifest.json");
const fixturePath = path.join(
  repositoryRoot,
  "apps/extension/test/fixtures/the-matrix.html",
);

const pageUrl = "https://letterboxd.com/film/the-matrix/";
const backendUrl = "https://api.lettercast.test/v1/movie/603/cast";
const imageUrl = "https://image.tmdb.org/t/p/w185/missing.jpg";

const successfulCast = {
  cast: [
    {
      id: 287,
      name: "Carrie-Anne Moss",
      character: "Trinity",
      profilePath: null,
      order: 0,
    },
  ],
};

async function launchExtension(): Promise<BrowserContext> {
  return chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    serviceWorkers: "allow",
  });
}

async function fulfillPage(route: Route, html: string): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: html,
  });
}

async function configureFixture(
  context: BrowserContext,
  options: {
    html: string;
    backendStatus?: number;
    backendBody?: unknown;
    onBackendRequest?: (url: string, method: string) => void;
    failImage?: boolean;
  },
): Promise<void> {
  await context.route(pageUrl, (route) => fulfillPage(route, options.html));
  await context.route(backendUrl, async (route) => {
    const request = route.request();
    options.onBackendRequest?.(request.url(), request.method());
    await route.fulfill({
      status: options.backendStatus ?? 200,
      contentType: "application/json",
      body: JSON.stringify(options.backendBody ?? successfulCast),
    });
  });
  if (options.failImage === true) {
    await context.route(imageUrl, (route) => route.abort("failed"));
  }
}

async function openFixture(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
  return page;
}

test("enhances a supported fixture through real MV3 messaging", async () => {
  const html = await readFile(fixturePath, "utf8");
  const requests: Array<{ url: string; method: string }> = [];
  const context = await launchExtension();
  try {
    await configureFixture(context, {
      html,
      onBackendRequest: (url, method) => requests.push({ url, method }),
    });
    const page = await openFixture(context);

    await expect(page.locator("#tab-panel-cast + [data-lettercast-cast]")).toBeVisible();
    await expect(page.locator(".lettercast-cast__name")).toHaveText(
      "Carrie-Anne Moss",
    );
    await expect(page.locator(".lettercast-cast__character")).toHaveText(
      "Trinity",
    );
    expect(requests).toEqual([{ url: backendUrl, method: "GET" }]);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-lettercast-cast]")).toHaveCount(1);
    expect(requests).toEqual([
      { url: backendUrl, method: "GET" },
      { url: backendUrl, method: "GET" },
    ]);
  } finally {
    await context.close();
  }
});

test("leaves the page unchanged when the backend fails", async () => {
  const html = await readFile(fixturePath, "utf8");
  const context = await launchExtension();
  try {
    await configureFixture(context, {
      html,
      backendStatus: 503,
      backendBody: { error: "BACKEND_UNAVAILABLE" },
    });
    const page = await openFixture(context);

    await expect(page.locator("[data-lettercast-cast]")).toHaveCount(0);
    await expect(page.locator("#tab-panel-cast .cast-list")).toContainText(
      "Sample Two",
    );
  } finally {
    await context.close();
  }
});

test("does not message for an invalid movie identity", async () => {
  const html = (await readFile(fixturePath, "utf8")).replace(
    'data-tmdb-id="603"',
    'data-tmdb-id="604"',
  );
  let backendRequests = 0;
  const context = await launchExtension();
  try {
    await configureFixture(context, {
      html,
      onBackendRequest: () => {
        backendRequests += 1;
      },
    });
    const page = await openFixture(context);

    await expect(page.locator("[data-lettercast-cast]")).toHaveCount(0);
    await page.waitForTimeout(250);
    expect(backendRequests).toBe(0);
  } finally {
    await context.close();
  }
});

test("uses a placeholder when a TMDB profile image fails", async () => {
  const html = await readFile(fixturePath, "utf8");
  const context = await launchExtension();
  try {
    await configureFixture(context, {
      html,
      backendBody: {
        cast: [{ ...successfulCast.cast[0], profilePath: "/missing.jpg" }],
      },
      failImage: true,
    });
    const page = await openFixture(context);

    await expect(page.locator(".lettercast-cast__placeholder")).toBeVisible();
    await expect(page.locator(".lettercast-cast__image")).toHaveCount(0);
    await expect(page.locator("#tab-panel-cast .cast-list")).toContainText(
      "Sample Two",
    );
  } finally {
    await context.close();
  }
});

test("works in a fresh extension context with a newly started service worker", async () => {
  const html = await readFile(fixturePath, "utf8");

  for (let run = 0; run < 2; run += 1) {
    const context = await launchExtension();
    try {
      await configureFixture(context, { html });
      const page = await openFixture(context);

      await expect(page.locator("[data-lettercast-cast]")).toHaveCount(1);
      const serviceWorkers = context
        .serviceWorkers()
        .filter((worker) => worker.url().startsWith("chrome-extension://"));
      expect(serviceWorkers).toHaveLength(1);
    } finally {
      await context.close();
    }
  }
});

test("keeps the test backend host out of the production manifest", async () => {
  const productionManifest = JSON.parse(
    await readFile(productionManifestPath, "utf8"),
  ) as { host_permissions?: string[] };
  const e2eManifest = JSON.parse(await readFile(e2eManifestPath, "utf8")) as {
    host_permissions?: string[];
  };

  expect(e2eManifest.host_permissions).toEqual([
    "https://api.lettercast.test/*",
  ]);
  expect(productionManifest.host_permissions ?? []).not.toContain(
    "https://api.lettercast.test/*",
  );
});
