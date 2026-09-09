export type OriginDecision =
  | { allowed: true; origin?: string }
  | { allowed: false };

const CHROME_EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

export function evaluateOrigin(
  requestOrigin: string | null,
  allowedExtensionOrigin: string | undefined,
): OriginDecision {
  if (
    allowedExtensionOrigin === undefined ||
    !CHROME_EXTENSION_ORIGIN.test(allowedExtensionOrigin)
  ) {
    return { allowed: false };
  }

  if (requestOrigin === null) {
    return { allowed: true };
  }

  if (requestOrigin !== allowedExtensionOrigin) {
    return { allowed: false };
  }

  return { allowed: true, origin: requestOrigin };
}
