import type { GetCastResponse } from "@lettercast/contracts";

import { createContentLifecycle } from "../src/content/lifecycle";

const enhancePage = createContentLifecycle({
  sendGetCast: async (request): Promise<GetCastResponse> =>
    browser.runtime.sendMessage(request),
});

export default defineContentScript({
  matches: ["https://letterboxd.com/film/*"],
  runAt: "document_idle",
  main() {
    void enhancePage({ document, pageUrl: window.location.href });
  },
});
