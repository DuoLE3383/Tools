import { getTrendDb, all } from "./database/db.js";

function normalizeCoinKey(value) {
  return String(value || "").trim().toLowerCase();
}

function toPriceEntry(row) {
  return {
    coin_id: row.coin_id || "",
    coin_name: row.coin_name || "",
    symbol: row.symbol || "",
    usd: Number(row.price_usd) || 0,
    btc: Number(row.price_btc) || 0,
    market_cap: Number(row.market_cap) || 0,
    volume_24h: Number(row.volume_24h) || 0,
    price_change_24h: Number(row.price_change_24h) || 0,
    last_updated: row.captured_at || null,
  };
}

export function buildCoinPriceCatalog(rows = []) {
  const catalog = {};

  for (const row of rows) {
    const entry = toPriceEntry(row);
    const keys = [
      row.coin_id,
      row.symbol,
      row.coin_name,
    ].map(normalizeCoinKey).filter(Boolean);

    for (const key of keys) {
      if (!catalog[key]) {
        catalog[key] = entry;
      }
    }
  }

  return catalog;
}

async function loadLatestCoinPriceRows(limit = null) {
  const db = await getTrendDb();
  let query = `
    SELECT coin_id, coin_name, symbol, price_usd, price_btc,
           market_cap, volume_24h, price_change_24h, captured_at
    FROM coin_prices
    WHERE captured_at = (
      SELECT MAX(captured_at)
      FROM coin_prices cp2
      WHERE cp2.coin_id = coin_prices.coin_id
    )
    ORDER BY price_usd DESC
  `;
  const params = [];

  if (Number.isFinite(limit) && limit > 0) {
    query += " LIMIT ?";
    params.push(limit);
  }

  return all(db, query, params);
}

export async function getStoredCoinPriceCatalog(limit = null) {
  const rows = await loadLatestCoinPriceRows(limit);
  return buildCoinPriceCatalog(rows);
}

export async function getStoredCoinPrice(coinKey) {
  if (!coinKey) return null;
  const catalog = await getStoredCoinPriceCatalog();
  return catalog[normalizeCoinKey(coinKey)] || null;
}

export async function fetchAllCoinGeckoMarketPrices() {
  const perPage = 250;
  const results = [];

  for (let page = 1; page <= 10; page += 1) {
    const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sparkline", "false");
    url.searchParams.set("price_change_percentage", "24h");

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      break;
    }

    for (const coin of data) {
      const entry = {
        coin_id: coin.id || "",
        coin_name: coin.name || "",
        symbol: coin.symbol || "",
        usd: Number(coin.current_price) || 0,
        btc: 0,
        market_cap: Number(coin.market_cap) || 0,
        volume_24h: Number(coin.total_volume) || 0,
        price_change_24h: Number(coin.price_change_percentage_24h) || 0,
        last_updated: coin.last_updated || new Date().toISOString(),
      };
      results.push(entry);
    }
  }

  return buildCoinPriceCatalog(results);
}
