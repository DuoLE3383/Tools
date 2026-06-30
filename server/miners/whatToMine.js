// server/miners/whatToMine.js
import { COMMON_HEADERS, CONFIG } from "../config.js";

const WTM_API_KEY = process.env.WTM_API;
const WTM_BASE_URL = "https://api.whattomine.com/v2";

const CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function scrapeWhatToMine(btcPrice) {
  if (!WTM_API_KEY) {
    console.warn("[WhatToMine] API key is not configured. Skipping fetch.");
    return { success: false, error: "WhatToMine API key not set" };
  }

  const cacheKey = "wtm_global";
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${WTM_BASE_URL}/coins`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, "X-API-KEY": WTM_API_KEY },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`WhatToMine API returned status ${response.status}`);
    }

    const data = await response.json();
    const result = { success: true, coinStats: data?.coins || [], fetchedAt: new Date().toISOString() };
    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error("[WhatToMine] Error fetching data:", err.message);
    return { success: false, error: err.message, coinStats: [] };
  }
}