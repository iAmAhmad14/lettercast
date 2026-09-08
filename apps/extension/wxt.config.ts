import { defineConfig } from "wxt";

import { parseBackendOrigin } from "./src/service-worker/backend-origin";

export default defineConfig({
  manifestVersion: 3,
  manifest: () => {
    const backendOrigin = parseBackendOrigin(
      import.meta.env.WXT_LETTERCAST_API_ORIGIN,
    );

    return {
      name: "Lettercast",
      description: "Adds TMDB cast details to supported Letterboxd movie pages.",
      version: "0.0.0",
      host_permissions:
        backendOrigin === null ? [] : [`${backendOrigin}/*`],
    };
  },
});
