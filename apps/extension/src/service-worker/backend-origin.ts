export function parseBackendOrigin(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      url.pathname !== "/" ||
      url.search !== "" ||
      url.hash !== "" ||
      (value !== url.origin && value !== `${url.origin}/`)
    ) {
      return null;
    }

    return url.origin;
  } catch {
    return null;
  }
}
