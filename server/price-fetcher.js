// server/price-fetcher.js
import { db } from './db.js';
import { dbAllAsync, dbRunAsync } from './mrr/db-utils.js';

async function fetchAndStoreCoinPrices() {
  console.log('[PriceFetcher] Starting coin price update job...');
  try {
    // Fetch all known coin identifiers and create a mapping to the canonical slug
    const cmcCoinsPromise = dbAllAsync('SELECT DISTINCT slug, symbol FROM cmc_coins WHERE slug IS NOT NULL');
    const coingeckoCoinsPromise = dbAllAsync('SELECT DISTINCT id, symbol FROM coingecko_coins WHERE id IS NOT NULL');

    const [cmcCoins, coingeckoCoins] = await Promise.all([cmcCoinsPromise, coingeckoCoinsPromise]);

    const idToSlugMap = new Map();
    cmcCoins.forEach(c => idToSlugMap.set(c.slug.toLowerCase(), c.slug.toLowerCase()));
    coingeckoCoins.forEach(c => {
      // Prefer CMC slug if a symbol match exists, otherwise use CoinGecko ID
      const cmcMatch = cmcCoins.find(cmc => cmc.symbol.toLowerCase() === c.symbol.toLowerCase());
      const slug = cmcMatch ? cmcMatch.slug.toLowerCase() : c.id.toLowerCase();
      idToSlugMap.set(c.id.toLowerCase(), slug);
    });

    const allCoinIds = [...new Set([...cmcCoins.map(c => c.slug.toLowerCase()), ...coingeckoCoins.map(c => c.id.toLowerCase())])];

    if (allCoinIds.length === 0) {
      console.warn('[PriceFetcher] No coin IDs found in the database. Skipping price fetch.');
      return;
    }

    // Fetch BTC price first to calculate price_btc for other coins
    const btcPriceRes = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
    const btcPriceData = await btcPriceRes.json();
    const btcPriceUsd = btcPriceData?.bitcoin?.usd;

    if (!btcPriceUsd) {
      throw new Error('Could not fetch BTC price to use for calculations.');
    }

    const CHUNK_SIZE = 150;
    let allFetchedCoins = [];

    for (let i = 0; i < allCoinIds.length; i += CHUNK_SIZE) {
      const chunk = allCoinIds.slice(i, i + CHUNK_SIZE);
      const coinIdsString = chunk.join(',');
      const apiUrl = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIdsString}&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h`;

      try {
        console.log(`[PriceFetcher] Fetching chunk ${i / CHUNK_SIZE + 1} for ${chunk.length} coins.`);
        const response = await fetch(apiUrl);
        if (!response.ok) {
          console.error(`[PriceFetcher] Chunk failed with status ${response.status}.`);
          continue; // Skip to the next chunk
        }
        const coins = await response.json();
        if (Array.isArray(coins)) {
          allFetchedCoins.push(...coins);
        }
      } catch (chunkError) {
        console.error(`[PriceFetcher] Error processing chunk: ${chunkError.message}`);
      }
    }

    if (allFetchedCoins.length === 0) {
      console.warn('[PriceFetcher] No coin data returned from API.');
      return;
    }

    const capturedAt = new Date().toISOString();

    await dbRunAsync('BEGIN TRANSACTION');
    try {
      const stmt = db.prepare(`
        INSERT OR REPLACE INTO coin_prices 
        (coin_id, coin_name, symbol, price_usd, price_btc, market_cap, volume_24h, price_change_24h, captured_at) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
      `);

      for (const coin of allFetchedCoins) {
        const priceUsd = coin.current_price || 0;
        const priceBtc = btcPriceUsd > 0 ? priceUsd / btcPriceUsd : 0;
        // Use the mapped slug as the canonical coin_id, falling back to the original ID
        const canonicalId = idToSlugMap.get(coin.id.toLowerCase()) || coin.id;
        await new Promise((resolve, reject) => {
          stmt.run(
            canonicalId, coin.name, coin.symbol.toUpperCase(), priceUsd, priceBtc,
            coin.market_cap || 0, coin.total_volume || 0, coin.price_change_percentage_24h || 0, capturedAt,
            (err) => err ? reject(err) : resolve()
          );
        });
      }
      await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
      await dbRunAsync('COMMIT');
      console.log(`[PriceFetcher] Successfully updated prices for ${allFetchedCoins.length} coins.`);
    } catch (dbError) {
      console.error('[PriceFetcher] Database transaction failed. Rolling back.', dbError.message);
      await dbRunAsync('ROLLBACK');
      throw dbError;
    }

  } catch (error) {
    console.error('[PriceFetcher] Error during price update:', error.message);
  }
}

export function startPriceFetcherJob(intervalMinutes = 15) {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[PriceFetcher] Scheduling coin price updates every ${intervalMinutes} minutes.`);
  fetchAndStoreCoinPrices(); // Run immediately on start
  setInterval(fetchAndStoreCoinPrices, intervalMs);
}