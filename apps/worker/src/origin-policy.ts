export type OriginDecision =
  | { allowed: true; origin: string }
  | { allowed: false };

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function evaluateOrigin(
  requestOrigin: string | null,
  allowedExtensionOrigin: string | undefined,
): OriginDecision {
  if (
    requestOrigin === null ||
    allowedExtensionOrigin === undefined ||
    !CHROME_EXTENSION_ORIGIN.test(allowedExtensionOrigin) ||
    requestOrigin !== allowedExtensionOrigin
  ) {
    return { allowed: false };
  }

  return { allowed: true, origin: requestOrigin };
}
