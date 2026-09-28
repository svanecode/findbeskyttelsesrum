function isProductionEnvironment() {
  return process.env.VERCEL_ENV === "production"
    || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production");
}

function configuredSecret() {
  const secret = process.env.RATE_LIMIT_HASH_SECRET?.trim();
  return secret && secret.length >= 32 ? secret : null;
}

/** False only in production without a usable secret, where the shared limiter cannot run. */
export function isRateLimitHashSecretUsable() {
  return configuredSecret() !== null || !isProductionEnvironment();
}

export function getRateLimitHashSecret() {
  const secret = configuredSecret();
  if (secret) return secret;

  if (isProductionEnvironment()) {
    throw new Error("RATE_LIMIT_HASH_SECRET must contain at least 32 characters in production.");
  }

  return `findbeskyttelsesrum-non-production-rate-limit-secret-v1:${process.env.VERCEL_DEPLOYMENT_ID ?? "local"}`;
}
