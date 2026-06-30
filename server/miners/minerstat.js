// server/miners/minerstat.js
import { COMMON_HEADERS, CONFIG } from "../config.js";

const MINERSTAT_API_KEY = process.env.MINERSTAT_API;
const MINERSTAT_BASE_URL = "https://api.minerstat.com/v2";

const CACHE = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

export async function scrapeMinerstat(btcPrice) {
  if (!MINERSTAT_API_KEY) {
    console.warn("[Minerstat] API key is not configured. Skipping fetch.");
    return { success: false, error: "Minerstat API key not set" };
  }

  const cacheKey = "minerstat_global";
  const cached = CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${MINERSTAT_BASE_URL}/coins?list=active`;
    const response = await fetch(url, {
      headers: { ...COMMON_HEADERS, "Authorization": `Bearer ${MINERSTAT_API_KEY}` },
      signal: AbortSignal.timeout(CONFIG.REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`Minerstat API returned status ${response.status}`);
    }

    const data = await response.json();
    const result = { success: true, coinStats: data, fetchedAt: new Date().toISOString() };
    CACHE.set(cacheKey, { data: result, timestamp: Date.now() });
    return result;
  } catch (err) {
    console.error("[Minerstat] Error fetching data:", err.message);
    return { success: false, error: err.message, coinStats: [] };
  }
}