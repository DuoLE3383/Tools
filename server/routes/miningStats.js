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
      if (apiRes.ok) {
        const json = await apiRes.json();
        if (json?.success && json?.result) {
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
          return res.json({ success: true, miningdutch: cachedDutchData });
        }
      }
      console.warn("[Mining-Dutch] API returned invalid response");
    } catch (err) {
      console.warn("[Mining-Dutch] Fetch failed:", err.message);
    }

    // Try web scrape fallback
    try {
      const { load } = await import("cheerio");
      const htmlRes = await fetch("https://www.mining-dutch.nl/", {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(10000),
      });
      if (htmlRes.ok) {
        const html = await htmlRes.text();
        const $ = load(html);
        const coinStats = [];
        $("table").each((ti, table) => {
          const headerText = $(table).find("thead tr th, th").map((i, h) => $(h).text().toLowerCase()).get().join(" ");
          if (headerText.includes("algo") || headerText.includes("algorithm") || headerText.includes("miner") || ti === 0) {
            $(table).find("tbody tr, tr").each((i, row) => {
              const cells = $(row).find("td");
              if (cells.length < 2) return;
              const algoText = $(cells[0]).text().trim();
              if (algoText && algoText.length > 1 && algoText.length < 20) {
                const revenueText = $(cells[cells.length - 1]).text().trim();
                const btcPerDay = parseFloat(revenueText.replace(/[^0-9.]/g, "")) || 0;
                const existing = coinStats.find(c => c.algorithm.toUpperCase() === algoText.toUpperCase());
                if (existing) existing.btcPerDay = Math.max(existing.btcPerDay, btcPerDay);
                else coinStats.push({ algorithm: algoText.toUpperCase(), coin: "", btcPerDay, usdPerDay: 0, miners: 0, hashrate: "N/A" });
              }
            });
          }
        });
        if (coinStats.length > 0) {
          cachedDutchData = { coinStats, fetchedAt: new Date().toISOString() };
          cachedDutchTime = now;
          return res.json({ success: true, miningdutch: cachedDutchData });
        }
      }
    } catch (err2) {
      console.warn("[Mining-Dutch] Web scrape failed:", err2.message);
    }

    // Fallback data
    const fallbackData = { coinStats: [
      { algorithm: "KAWPOW", coin: "", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "BEAMV3", coin: "", btcPerDay: 0.000004, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "KHEAVYHASH", coin: "", btcPerDay: 0.000008, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "OCTOPUS", coin: "", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "FISHHASH", coin: "", btcPerDay: 0.000002, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "RANDOMX", coin: "", btcPerDay: 0.000005, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "ETCHASH", coin: "", btcPerDay: 0.000004, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "AUTOLYKOS2", coin: "", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "ZELHASH", coin: "", btcPerDay: 0.000002, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      { algorithm: "BLAKE3", coin: "", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
    ], fetchedAt: new Date().toISOString(), fallback: true };
    console.warn("[Mining-Dutch] All methods failed, using fallback data");
    cachedDutchData = fallbackData;
    cachedDutchTime = now;
    res.json({ success: true, miningdutch: cachedDutchData, cached: false, warning: "Using fallback data" });
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

  app.get("/api/v2/mining-stats/hashrate.no", asyncHandler(async (req, res) => {
    // Return fallback data since hashrate.no has no public API
    res.json({
      success: true,
      coinStats: [
        { algorithm: "KAWPOW", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "BEAMV3", btcPerDay: 0.000004, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "KHEAVYHASH", btcPerDay: 0.000008, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "OCTOPUS", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "FISHHASH", btcPerDay: 0.000002, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "RANDOMX", btcPerDay: 0.000005, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "ETCHASH", btcPerDay: 0.000004, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "AUTOLYKOS2", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "ZELHASH", btcPerDay: 0.000002, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "BLAKE3", btcPerDay: 0.000003, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "DYNEXSOLVE", btcPerDay: 0.000002, usdPerDay: 0, miners: 0, hashrate: "N/A" },
        { algorithm: "KARLSENHASH", btcPerDay: 0.000001, usdPerDay: 0, miners: 0, hashrate: "N/A" },
      ],
      fetchedAt: new Date().toISOString(),
      source: "fallback",
    });
  }));

  app.get("/api/v2/mining-stats/minerstat", asyncHandler(async (req, res) => {
    const { scrapeMinerstat } = await import("../miners/minerstat.js");
    try {
      const data = await scrapeMinerstat();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }));

  app.get("/api/v2/mining-stats/whattomine", asyncHandler(async (req, res) => {
    const { scrapeWhatToMine } = await import("../miners/whatToMine.js");
    try {
      const data = await scrapeWhatToMine();
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }));

  // ─── K1Pool ─────────────────────────────────────────────────
  app.get("/api/v2/mining-stats/k1pool", asyncHandler(async (req, res) => {
    const { getK1PoolMinerStats, getK1PoolGlobal } = await import("../miners/k1pool.js");
    const { pool, address } = req.query;

    try {
      if (address && pool) {
        const result = await getK1PoolMinerStats(pool, address);
        return res.json(result);
      }
      // If no address specified, return global pool data
      const global = await getK1PoolGlobal();
      res.json(global);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));

  // ─── Kryptex ────────────────────────────────────────────────
  app.get("/api/v2/mining-stats/kryptex", asyncHandler(async (req, res) => {
    const { getKryptexMinerStats, getKryptexGlobalStats } = await import("../miners/kryptex.js");
    const { coin, address } = req.query;

    if (!coin) {
      return res.status(400).json({ success: false, error: "coin query parameter is required (e.g. 'etc')" });
    }

    try {
      if (address) {
        const result = await getKryptexMinerStats(coin, address);
        return res.json(result);
      }
      // If no address, return global pool stats
      const global = await getKryptexGlobalStats(coin);
      res.json(global);
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }));
}
