export type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type RateLimitEnvironment = {
  CAST_RATE_LIMITER?: RateLimitBinding;
};

export type RateLimitDecision = "allowed" | "denied" | "unavailable";

export type CastRateLimiter = {
  check(
    tmdbId: number,
    environment: RateLimitEnvironment,
  ): Promise<RateLimitDecision>;
};

export function createCastRateLimitKey(tmdbId: number): string {
  return `get-cast:${tmdbId}`;
}

export function createNativeCastRateLimiter(): CastRateLimiter {
  return {
    async check(tmdbId, environment) {
      const binding = environment.CAST_RATE_LIMITER;
      if (binding === undefined) {
        return "unavailable";
      }

      try {
        const result = await binding.limit({
          key: createCastRateLimitKey(tmdbId),
        });
        return result.success ? "allowed" : "denied";
      } catch {
        // Rate limiting protects upstream work, so binding failure must not
        // silently bypass it.
        return "unavailable";
      }
    },
  };
}
