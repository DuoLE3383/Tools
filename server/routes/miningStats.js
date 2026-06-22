// routes/miningStats.js
import { asyncHandler } from "../utils.js";

export function registerMiningStatsRoutes(app) {
  app.get("/api/v2/mining-stats/herominers_global", asyncHandler(async (req, res) => {
    const { scrapeHeroMinersGlobal } = await import("../miners/heroMiners.js");
    const { getBtcPrice } = await import("../utils/priceUtils.js");
    const force = req.query.force === "true";
    const btcPrice = await getBtcPrice();
    const result = await scrapeHeroMinersGlobal(btcPrice);
    res.json(result);
  }));

  app.get("/api/v2/mining-stats/miningpooldutch", asyncHandler(async (req, res) => {
    try {
      const { getBtcPrice } = await import("../utils/priceUtils.js");
      const btcPrice = await getBtcPrice();
      const apiRes = await fetch("https://www.mining-dutch.nl/api/v1/public/multiport/?method=avgprofitability", {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(15000),
      });
      if (!apiRes.ok) throw new Error(`Mining-Dutch API: ${apiRes.status}`);
      const json = await apiRes.json();
      if (!json?.success || !json?.result) throw new Error("Mining-Dutch API returned invalid data");
      const coinStats = Object.entries(json.result).map(([algorithm, data]) => {
        const btcPerDay = Number.isFinite(parseFloat(data.expected || data.average || 0)) ? parseFloat(data.expected || data.average || 0) : 0;
        return ({
          algorithm,
          coin: algorithm.toUpperCase(),
          btcPerDay,
          usdPerDay: btcPerDay * btcPrice,
          miners: 0,
          hashrate: "N/A",
        });
      });
      res.json({ success: true, miningpooldutch: { coinStats, fetchedAt: new Date().toISOString() } });
    } catch (err) {
      res.json({ success: false, error: err.message, miningpooldutch: { coinStats: [] } });
    }
  }));

  app.get("/api/v2/mining-stats/all", asyncHandler(async (req, res) => {
    const { scrapeHeroMinersGlobal: scrapeHero } = await import("../miningOpportunityNotifier.js");
    const scrapeHeroMinersGlobal = scrapeHero;
    const force = req.query.force === "true";
    const [heroResult, dutchResult] = await Promise.allSettled([
      scrapeHeroMinersGlobal(force),
      (async () => {
        try {
          const apiRes = await fetch("https://www.mining-dutch.nl/api/v1/public/multiport/?method=avgprofitability", {
            headers: { "User-Agent": "Mozilla/5.0" },
            signal: AbortSignal.timeout(15000),
          });
          const json = await apiRes.json();
          if (!json?.success || !json?.result) throw new Error("Invalid data");
          const coinStats = Object.entries(json.result).map(([algorithm, data]) => ({
            algorithm,
            coin: algorithm.toUpperCase(),
            btcPerDay: Number.isFinite(parseFloat(data.expected || data.average || 0)) ? parseFloat(data.expected || data.average || 0) : 0,
            usdPerDay: 0,
            miners: 0,
            hashrate: "N/A",
          }));
          return { success: true, miningpooldutch: { coinStats, fetchedAt: new Date().toISOString() } };
        } catch (err) {
          return { success: false, error: err.message, miningpooldutch: { coinStats: [] } };
        }
      })(),
    ]);
    res.json({
      herominers_global: heroResult.status === "fulfilled" ? heroResult.value : null,
      miningpooldutch: dutchResult.status === "fulfilled" ? dutchResult.value?.miningpooldutch : null,
    });
  }));
}
