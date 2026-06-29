// server/api-client.js

/**
 * Custom error class for handling API rate limit responses (HTTP 429).
 */
export class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * A simple in-memory rate limiter.
 */
class RateLimiter {
  constructor(maxRequests, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.wait(); // Re-check after waiting
    }

    this.requests.push(now);
  }
}

/**
 * Creates a higher-level API client with built-in rate limiting and retries.
 */
export function createApiClient(config) {
  const limiters = {};
  for (const key in config) {
    limiters[key.toLowerCase()] = new RateLimiter(config[key].RATE_LIMIT);
  }

  async function fetchWithRetry(sourceName, url, options = {}) {
    const sourceConfig = config[sourceName.toUpperCase()];
    const maxRetries = sourceConfig?.MAX_RETRIES || 3;
    const initialDelay = sourceConfig?.RETRY_DELAY || 1000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await limiters[sourceName.toLowerCase()]?.wait();

        const response = await fetch(url, {
          ...options,
          headers: { 'User-Agent': 'BenTreMiningTool/2.0', 'Accept': 'application/json', ...options.headers },
          signal: AbortSignal.timeout(15000),
        });

        if (response.ok) return response;
        if (response.status === 429) throw new RateLimitError(`Rate limited by ${sourceName}`);

        if (response.status >= 500) { // Server-side error, worth retrying
          const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(`[APIClient:${sourceName}] Server error ${response.status}. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        return response; // Return non-OK response for client to handle (e.g., 404)
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && !(error instanceof RateLimitError)) {
          const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(`[APIClient:${sourceName}] Fetch failed (attempt ${attempt}/${maxRetries}). Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    throw lastError || new Error(`[APIClient:${sourceName}] Max retries exceeded for ${url}`);
  }

  return { fetchWithRetry };
}