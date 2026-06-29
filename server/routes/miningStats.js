// server/routes/miningStats.js
import { asyncHandler } from "../utils.js";

let cachedDutchData = null;
let cachedDutchTime = 0;
const DUTCH_CACHE_TTL = 30000;

export function registerMiningStatsRoutes(app) {
  app.get("/api/v2/mining-stats/herominers", asyncHandler(async (req, res) => {
    const { scrapeHeroMinersGlobal } = await import("../miningOpportunityNotifier.js");
    const force = req.query.force === "true";
    const result = await scrapeHeroMinersGlobal(force);
    res.json(result);
  }));

  app.get("/api/v2/mining-stats/miningdutch", asyncHandler(async (req, res) => {
    const force = req.query.force === "true";
    const now = Date.now();
    if (!force && cachedDutchData && (now - cachedDutchTime < DUTCH_CACHE_TTL)) {
      return res.json({ success: true, miningdutch: cachedDutchData, cached: true });
    }
    try {
      const apiRes = await fetch("https://www.mining-dutch.nl/api/v1/public/multiport/?method=avgprofitability", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      if (!apiRes.ok) throw new Error(`Mining-Dutch API: ${apiRes.status}`);
      const json = await apiRes.json();
      if (!json?.success || !json?.result) throw new Error("Mining-Dutch API returned invalid data");
      const coinStats = Object.entries(json.result).map(([algorithm, data]) => ({
        algorithm,
        coin: "",
        btcPerDay: Number.isFinite(parseFloat(data.expected || data.average || 0)) ? parseFloat(data.expected || data.average || 0) : 0,
        usdPerDay: 0,
        miners: 0,
        hashrate: "N/A",
      }));
      cachedDutchData = { coinStats, fetchedAt: new Date().toISOString() };
      cachedDutchTime = now;
      res.json({ success: true, miningdutch: cachedDutchData });
    } catch (err) {
      if (cachedDutchData) {
        console.warn("[Mining-Dutch] Fetch failed, returning cached data:", err.message);
        return res.json({ success: true, miningdutch: cachedDutchData, cached: true, warning: err.message });
      }
      res.json({ success: false, error: err.message, miningdutch: { coinStats: [] } });
    }
  }));

  app.get("/api/v2/mining-stats/all", asyncHandler(async (req, res) => {
    const { scrapeHeroMinersGlobal } = await import("../miningOpportunityNotifier.js");
    const force = req.query.force === "true";
    const [heroResult, dutchResult] = await Promise.allSettled([
      scrapeHeroMinersGlobal(force),
      (async () => {
        const now = Date.now();
        if (!force && cachedDutchData && (now - cachedDutchTime < DUTCH_CACHE_TTL)) {
          return { success: true, miningdutch: cachedDutchData, cached: true };
        }
        try {
          const apiRes = await fetch("https://www.mining-dutch.nl/api/v1/public/multiport/?method=avgprofitability", {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(15000),
          });
          const json = await apiRes.json();
          if (!json?.success || !json?.result) throw new Error("Invalid data");
          const coinStats = Object.entries(json.result).map(([algorithm, data]) => ({
            algorithm,
            coin: "",
            btcPerDay: Number.isFinite(parseFloat(data.expected || data.average || 0)) ? parseFloat(data.expected || data.average || 0) : 0,
            usdPerDay: 0,
            miners: 0,
            hashrate: "N/A",
          }));
          cachedDutchData = { coinStats, fetchedAt: new Date().toISOString() };
          cachedDutchTime = now;
          return { success: true, miningdutch: cachedDutchData };
        } catch (err) {
          if (cachedDutchData) {
            console.warn("[Mining-Dutch] All Stats fetch failed, returning cached data:", err.message);
            return { success: true, miningdutch: cachedDutchData, cached: true, warning: err.message };
          }
          return { success: false, error: err.message, miningdutch: { coinStats: [] } };
        }
      })(),
    ]);
    res.json({
      herominers: heroResult.status === "fulfilled" ? heroResult.value : null,
      miningdutch: dutchResult.status === "fulfilled" ? dutchResult.value?.miningdutch : null,
    });
  }));
}