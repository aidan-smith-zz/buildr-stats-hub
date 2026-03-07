/** Prisma codes for connection/pool timeouts (crawlers, serverless concurrency). */
const POOL_ERROR_CODES = new Set(["P2024", "P2028"]);

/**
 * Retry a function on transient pool errors (P2024 connection timeout, P2028 transaction timeout).
 */
export async function withPoolRetry<T>(fn: () => Promise<T>, maxAttempts = 2): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
      if (typeof code === "string" && POOL_ERROR_CODES.has(code) && attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 400 * attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}
