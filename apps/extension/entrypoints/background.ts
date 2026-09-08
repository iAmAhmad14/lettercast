import { createBackendClient } from "../src/service-worker/backend-client";
import { createGetCastMessageHandler } from "../src/service-worker/message-handler";

const client = createBackendClient({
  backendOrigin: import.meta.env.WXT_LETTERCAST_API_ORIGIN,
});
const handleMessage = createGetCastMessageHandler(client);

export default defineBackground(() => {
  browser.runtime.onMessage.addListener(handleMessage);
});
