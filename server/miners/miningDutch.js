// server/miners/miningDutch.js
import { COMMON_HEADERS } from "../config.js";
import { normalizeAlgo } from "../../src/core/mapping.js";
import { getBtcPrice } from "../utils/priceUtils.js";

let dutchCache = { data: null, timestamp: 0 };
const DUTCH_CACHE_TTL = 120000;

export async function scrapeMiningDutchGlobal(btcPrice, force = false) {
  const now = Date.now();
  if (!force && dutchCache.data && now - dutchCache.timestamp < DUTCH_CACHE_TTL) {
    return dutchCache.data;
  }

  let coinStats = [];

  // Try API endpoint first
  try {
    const apiRes = await fetch(
      "https://www.mining-dutch.nl/api/v1/public/multiport/?method=avgprofitability",
      { headers: COMMON_HEADERS, signal: AbortSignal.timeout(5000) }
    );

    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json?.success && json?.result) {
        coinStats = Object.entries(json.result).map(([algorithm, data]) => {
          const btcPerDay = parseFloat(data.expected || data.average || 0);
          return {
            algorithm,
            normalizedAlgo: normalizeAlgo(algorithm),
            nicehashAlgo: algorithm.toUpperCase(),
            coin: algorithm.toUpperCase(),
            miners: 0,
            btcPerDay: Number.isFinite(btcPerDay) ? btcPerDay : 0,
            usdPerDay: Number.isFinite(btcPerDay) ? btcPerDay * btcPrice : 0,
            hashrate: "N/A",
          };
        });

        const result = { success: true, coinStats };
        dutchCache = { data: result, timestamp: now };
        return result;
      }
    }
    console.warn("[Mining-Dutch] API returned invalid response, trying web scrape...");
  } catch (err) {
    console.warn("[Mining-Dutch] API fetch failed, trying web scrape:", err.message);
  }

  // Fallback: scrape the website HTML
  try {
    const htmlRes = await fetch("https://www.mining-dutch.nl/", {
      headers: { ...COMMON_HEADERS, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });

    if (htmlRes.ok) {
      const html = await htmlRes.text();
      const { load } = await import("cheerio");
      const $ = load(html);

      // Try to find tables with mining data
      $("table").each((ti, table) => {
        const headerText = $(table).find("thead tr th").map((i, h) => $(h).text().toLowerCase()).get().join(" ");
        const isMiningTable = headerText.includes("algo") || headerText.includes("algorithm") ||
                              headerText.includes("coin") || headerText.includes("miner") ||
                              headerText.includes("revenue") || headerText.includes("profit");

        if (isMiningTable || ti === 0) {
          $(table).find("tbody tr, tr").each((i, row) => {
            const cells = $(row).find("td");
            if (cells.length < 2) return;

            const algoText = $(cells[0]).text().trim();
            const revenueText = $(cells[cells.length - 1]).text().trim();
            const minersText = $(cells[Math.min(1, cells.length - 1)]).text().trim();

            if (algoText && algoText.length > 1 && algoText.length < 20) {
              const btcPerDay = parseFloat(revenueText.replace(/[^0-9.]/g, "")) || 0;
              const existing = coinStats.find(c => c.algorithm.toUpperCase() === algoText.toUpperCase());
              if (existing) {
                existing.btcPerDay = Math.max(existing.btcPerDay, btcPerDay);
              } else if (btcPerDay > 0 || !isNaN(parseInt(minersText))) {
                coinStats.push({
                  algorithm: algoText.toUpperCase(),
                  normalizedAlgo: normalizeAlgo(algoText),
                  nicehashAlgo: algoText.toUpperCase(),
                  coin: algoText.toUpperCase(),
                  miners: parseInt(minersText.replace(/[^0-9]/g, "")) || 0,
                  btcPerDay,
                  usdPerDay: btcPerDay * btcPrice,
                  hashrate: "N/A",
                });
              }
            }
          });
        }
      });
    }

    if (coinStats.length > 0) {
      console.log(`[Mining-Dutch] Scraped ${coinStats.length} algos from web`);
      const result = { success: true, coinStats };
      dutchCache = { data: result, timestamp: now };
      return result;
    }
  } catch (err) {
    console.warn("[Mining-Dutch] Web scrape failed:", err.message);
  }

  // Last-resort fallback data - comprehensive list of all known mining algorithms
  const fallbackStats = [
    { algorithm: "KAWPOW", btcPerDay: 0.000003, coin: "RVN" },
    { algorithm: "BEAMV3", btcPerDay: 0.000004, coin: "BEAM" },
    { algorithm: "KHEAVYHASH", btcPerDay: 0.000009, coin: "KAS" },
    { algorithm: "OCTOPUS", btcPerDay: 0.0000035, coin: "CFX" },
    { algorithm: "FISHHASH", btcPerDay: 0.0000025, coin: "IRON" },
    { algorithm: "RANDOMX", btcPerDay: 0.000006, coin: "ZEPH" },
    { algorithm: "ETCHASH", btcPerDay: 0.000005, coin: "ETC" },
    { algorithm: "AUTOLYKOS2", btcPerDay: 0.0000035, coin: "ERG" },
    { algorithm: "ZELHASH", btcPerDay: 0.0000025, coin: "FLUX" },
    { algorithm: "BLAKE3", btcPerDay: 0.0000035, coin: "ALPH" },
    { algorithm: "DYNEXSOLVE", btcPerDay: 0.0000025, coin: "DYNEX" },
    { algorithm: "KARLSENHASH", btcPerDay: 0.0000015, coin: "KARLSEN" },
    { algorithm: "NEXAPOW", btcPerDay: 0.000002, coin: "NEXA" },
    { algorithm: "SHA256", btcPerDay: 0.000012, coin: "BTC" },
    { algorithm: "SCRYPT", btcPerDay: 0.0000008, coin: "DOGE" },
    { algorithm: "X11", btcPerDay: 0.0000005, coin: "DASH" },
    { algorithm: "LYRA2REV2", btcPerDay: 0.000001, coin: "VTC" },
    { algorithm: "NEOSCRYPT", btcPerDay: 0.0000006, coin: "FTC" },
    { algorithm: "YESPOWER", btcPerDay: 0.0000012, coin: "VRSC" },
    { algorithm: "PROGPOWZ", btcPerDay: 0.000002, coin: "ZANO" },
    { algorithm: "XELISHASHV3", btcPerDay: 0.000002, coin: "XELIS" },
    { algorithm: "CUCKAROOM", btcPerDay: 0.000001, coin: "GRIN" },
    { algorithm: "CUCKATOO", btcPerDay: 0.0000008, coin: "GRIN" },
    { algorithm: "EQUIHASH", btcPerDay: 0.0000005, coin: "ZEC" },
    { algorithm: "EAGLESONG", btcPerDay: 0.0000015, coin: "QRL" },
    { algorithm: "MINOTARIUSXNA", btcPerDay: 0.0000005, coin: "XNA" },
  ];

  coinStats = fallbackStats.map(a => ({
    algorithm: a.algorithm,
    normalizedAlgo: normalizeAlgo(a.algorithm),
    nicehashAlgo: a.algorithm,
    coin: a.algorithm,
    miners: 0,
    btcPerDay: a.btcPerDay,
    usdPerDay: a.btcPerDay * btcPrice,
    hashrate: "N/A",
  }));

  console.log("[Mining-Dutch] Using fallback data");
  const result = { success: true, coinStats, fallback: true };
  dutchCache = { data: result, timestamp: now };
  return result;
}
