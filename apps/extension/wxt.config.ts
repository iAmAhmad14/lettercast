import { defineConfig } from "wxt";

import { parseBackendOrigin } from "./src/service-worker/backend-origin";

const PUBLIC_MANIFEST_KEY = [
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw98hIwr7qIje+GHthgFk",
  "NrCKIj/O1jfFtN2oKvma/pWMQQyyCIQGMtTnyyPuYgBTLzUP3VJsZ7Nxyfh8bk",
  "nkLlfyirJDVaTg/2EYkoAWQzkvdkOaQIG2qto39xmva2kye/5KldDsHPUgT0MA",
  "MYJZSv4SUzCe2UFX+2rMUaJwjgU9mvuZC/6Av1euK/RzGd/mwyvEcOVINuDFON",
  "KJWE5EH9h4fN24aE85mfBixmuIKdlptVhR5al4Fg7md9Dwfm3zIuK5899YcRDr",
  "vr8esCNC9uakq6eJIU+iDYhbn+3wv/GqSczljvapLAc8QVnr4TBauXIOA4LB0IA",
  "bOxXVVihi4QIDAQAB",
].join("");

export default defineConfig({
  manifestVersion: 3,
  zip: {
    name: "lettercast",
    artifactTemplate: "{{name}}-{{version}}-{{browser}}.zip",
    zipSources: false,
  },
  manifest: () => {
    const backendOrigin = parseBackendOrigin(
      import.meta.env.WXT_LETTERCAST_API_ORIGIN,
    );

    return {
      key: PUBLIC_MANIFEST_KEY,
      name: "Lettercast",
      description:
        "Enhances Letterboxd film pages with TMDB cast photos and character names.",
      version: "1.0.0",
      icons: {
        16: "icon/16.png",
        32: "icon/32.png",
        48: "icon/48.png",
        128: "icon/128.png",
      },
      host_permissions:
        backendOrigin === null ? [] : [`${backendOrigin}/*`],
    };
  },
});
