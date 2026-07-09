// server/api-client.js
import axios from 'axios';

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
      return this.wait();
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

  // Default config for external APIs
  const defaultConfig = {
    USER_API: {
      RATE_LIMIT: 60, // 60 requests per minute
      MAX_RETRIES: 3,
      RETRY_DELAY: 1000,
      TIMEOUT: 15000,
    },
    ...config
  };

  async function fetchWithRetry(sourceName, url, options = {}) {
    const sourceConfig = defaultConfig[sourceName.toUpperCase()] || defaultConfig.USER_API;
    const maxRetries = sourceConfig?.MAX_RETRIES || 3;
    const initialDelay = sourceConfig?.RETRY_DELAY || 1000;
    const timeout = sourceConfig?.TIMEOUT || 15000;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Apply rate limiting
        await limiters[sourceName.toLowerCase()]?.wait();

        // Prepare headers
        const headers = {
          'User-Agent': 'BenTreMiningTool/2.0',
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...options.headers,
        };

        // If we have a token, add it
        if (options.token) {
          headers['Authorization'] = `Bearer ${options.token}`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...options,
          headers,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) return response;
        
        if (response.status === 429) {
          throw new RateLimitError(`Rate limited by ${sourceName}`);
        }

        if (response.status >= 500) {
          const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(`[APIClient:${sourceName}] Server error ${response.status}. Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
          continue;
        }

        return response;
      } catch (error) {
        lastError = error;
        if (error.name === 'AbortError') {
          console.warn(`[APIClient:${sourceName}] Request timeout for ${url}`);
        }
        if (attempt < maxRetries && !(error instanceof RateLimitError)) {
          const backoffDelay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(`[APIClient:${sourceName}] Fetch failed (attempt ${attempt}/${maxRetries}). Retrying in ${backoffDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffDelay));
        }
      }
    }
    throw lastError || new Error(`[APIClient:${sourceName}] Max retries exceeded for ${url}`);
  }

  // Helper for JSON responses
  async function fetchJson(sourceName, url, options = {}) {
    const response = await fetchWithRetry(sourceName, url, options);
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON response from ${sourceName}: ${text.substring(0, 100)}`);
    }
  }

  return { 
    fetchWithRetry, 
    fetchJson,
    // Convenience methods
    get: (source, url, options = {}) => 
      fetchJson(source, url, { ...options, method: 'GET' }),
    post: (source, url, body, options = {}) =>
      fetchJson(source, url, { 
        ...options, 
        method: 'POST',
        body: JSON.stringify(body)
      }),
    put: (source, url, body, options = {}) =>
      fetchJson(source, url, {
        ...options,
        method: 'PUT',
        body: JSON.stringify(body)
      }),
    del: (source, url, options = {}) =>
      fetchJson(source, url, { ...options, method: 'DELETE' }),
  };
}