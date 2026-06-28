import { getTrendDb, all } from "./db.js";
import { COIN_TO_COINGECKO_MAP } from "./coinGecko/coinMapping.js";

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

const COINGECKO_ID_TO_SYMBOL = new Map();
for (const [symbol, coinId] of Object.entries(COIN_TO_COINGECKO_MAP)) {
  const current = COINGECKO_ID_TO_SYMBOL.get(coinId);
  if (!current || String(symbol).length < String(current).length) {
    COINGECKO_ID_TO_SYMBOL.set(coinId, symbol);
  }
}

function makePriceEntry({
  coinId,
  symbol,
  name,
  usd = 0,
  btc = 0,
  marketCap = 0,
  volume24h = 0,
  change24h = 0,
  change7d = 0,
  change30d = 0,
  lastUpdated = new Date().toISOString(),
  source = "unknown",
}) {
  return {
    id: coinId,
    coin_id: coinId,
    symbol,
    name,
    price_usd: Number(usd) || 0,
    price_btc: Number(btc) || 0,
    market_cap: Number(marketCap) || 0,
    volume_24h: Number(volume24h) || 0,
    price_change_24h: Number(change24h) || 0,
    price_change_7d: Number(change7d) || 0,
    price_change_30d: Number(change30d) || 0,
    last_updated: lastUpdated,
    source,
  };
}

function mergePriceCatalog(target, entries) {
  for (const entry of entries) {
    if (!entry) continue;
    const candidates = [
      normalizeCoinKey(entry.coin_id || entry.id),
      normalizeCoinKey(entry.symbol),
      normalizeCoinKey(entry.name),
    ].filter(Boolean);
    for (const key of candidates) {
      const existing = target[key];
      if (!existing || (Number(existing.price_usd) <= 0 && Number(entry.price_usd) > 0)) {
        target[key] = entry;
      }
    }
  }
}

function resolveFallbackSymbol(coinKey) {
  const normalized = normalizeCoinKey(coinKey);
  if (!normalized) return "";
  if (COINGECKO_ID_TO_SYMBOL.has(normalized)) {
    return String(COINGECKO_ID_TO_SYMBOL.get(normalized) || "").toUpperCase();
  }
  return normalized.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

async function fetchJson(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "BenTreMiningTool/2.0",
      ...headers,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function fetchFallbackPriceEntries(missingKeys = []) {
  const symbols = Array.from(
    new Set(missingKeys.map(resolveFallbackSymbol).filter(Boolean)),
  );
  if (symbols.length === 0) return [];

  const results = [];
  const symbolSet = new Set(symbols);

  // CoinDesk: BTC and ETH
  if (symbolSet.has("BTC")) {
    try {
      const data = await fetchJson("https://api.coindesk.com/v1/bpi/currentprice.json");
      const btcPrice = Number(data?.bpi?.USD?.rate_float || 0);
      if (btcPrice > 0) {
        results.push(
          makePriceEntry({
            coinId: "bitcoin",
            symbol: "BTC",
            name: "Bitcoin",
            usd: btcPrice,
            source: "coindesk",
          }),
        );
      }
    } catch {}
  }
  if (symbolSet.has("ETH")) {
    try {
      const data = await fetchJson("https://api.coindesk.com/v1/bpi/currentprice/ETH.json");
      const ethPrice = Number(data?.bpi?.USD?.rate_float || 0);
      if (ethPrice > 0) {
        results.push(
          makePriceEntry({
            coinId: "ethereum",
            symbol: "ETH",
            name: "Ethereum",
            usd: ethPrice,
            source: "coindesk",
          }),
        );
      }
    } catch {}
  }

  // Binance: common large-cap symbols
  for (const symbol of symbols.filter((s) => ["BTC", "ETH", "BNB", "XRP", "SOL", "ADA", "DOGE", "LTC", "BCH", "ETC", "TRX", "XLM", "LINK"].includes(s))) {
    try {
      const data = await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}USDT`);
      const price = Number(data?.lastPrice || 0);
      if (price > 0) {
        results.push(
          makePriceEntry({
            coinId: COIN_TO_COINGECKO_MAP[symbol] || symbol.toLowerCase(),
            symbol,
            name: symbol,
            usd: price,
            volume24h: Number(data?.volume || 0),
            change24h: Number(data?.priceChangePercent || 0),
            source: "binance",
          }),
        );
      }
    } catch {}
  }

  // Kraken: BTC/ETH and a few majors
  for (const symbol of symbols.filter((s) => ["BTC", "ETH", "XRP", "ADA", "DOT", "LINK", "LTC", "BCH", "XLM", "UNI"].includes(s))) {
    try {
      const pair = `${symbol}USD`;
      const data = await fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
      const result = data?.result || {};
      const firstTicker = Object.values(result)[0];
      const price = Number(firstTicker?.c?.[0] || 0);
      if (price > 0) {
        results.push(
          makePriceEntry({
            coinId: COIN_TO_COINGECKO_MAP[symbol] || symbol.toLowerCase(),
            symbol,
            name: symbol,
            usd: price,
            volume24h: Number(firstTicker?.v?.[1] || 0),
            source: "kraken",
          }),
        );
      }
    } catch {}
  }

  // Crypto.com: a small set of supported pairs
  for (const symbol of symbols.filter((s) => ["BTC", "ETH", "XRP", "DOGE", "LTC", "ADA", "DOT", "LINK", "UNI"].includes(s))) {
    try {
      const data = await fetchJson(
        `https://api.crypto.com/v2/public/get-ticker?instrument_name=${symbol}_USD`,
      );
      const ticker = data?.result?.data?.[0];
      const price = Number(ticker?.last_price || 0);
      if (price > 0) {
        results.push(
          makePriceEntry({
            coinId: COIN_TO_COINGECKO_MAP[symbol] || symbol.toLowerCase(),
            symbol,
            name: symbol,
            usd: price,
            volume24h: Number(ticker?.volume24h || 0),
            change24h: Number(ticker?.price_change_24h || 0),
            source: "cryptocom",
          }),
        );
      }
    } catch {}
  }

  // CoinMarketCap if key exists
  if (process.env.CMC_API && symbols.length > 0) {
    try {
      const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbols.join(",")}`;
      const data = await fetchJson(url, { "X-CMC_PRO_API_KEY": process.env.CMC_API });
      const entries = data?.data ? Object.values(data.data) : [];
      for (const coinData of entries) {
        const symbol = String(coinData?.symbol || "").toUpperCase();
        const price = Number(coinData?.quote?.USD?.price || 0);
        if (symbol && price > 0) {
          results.push(
            makePriceEntry({
              coinId: COIN_TO_COINGECKO_MAP[symbol] || symbol.toLowerCase(),
              symbol,
              name: coinData?.name || symbol,
              usd: price,
              marketCap: coinData?.quote?.USD?.market_cap || 0,
              volume24h: coinData?.quote?.USD?.volume_24h || 0,
              change24h: coinData?.quote?.USD?.percent_change_24h || 0,
              change7d: coinData?.quote?.USD?.percent_change_7d || 0,
              change30d: coinData?.quote?.USD?.percent_change_30d || 0,
              lastUpdated: coinData?.last_updated || new Date().toISOString(),
              source: "cmc",
            }),
          );
        }
      }
    } catch {}
  }

  return results;
}

export async function fetchAllCoinGeckoMarketPrices(coinIds = null) {
  const perPage = 250;
  const catalog = {};

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
      const entry = makePriceEntry({
        coinId: coin.id || "",
        symbol: coin.symbol || "",
        name: coin.name || "",
        usd: Number(coin.current_price) || 0,
        btc: 0,
        marketCap: Number(coin.market_cap) || 0,
        volume24h: Number(coin.total_volume) || 0,
        change24h: Number(coin.price_change_percentage_24h) || 0,
        lastUpdated: coin.last_updated || new Date().toISOString(),
        source: "coingecko",
      });
      mergePriceCatalog(catalog, [entry]);
    }
  }

  const requestedKeys = Array.isArray(coinIds)
    ? coinIds.map(normalizeCoinKey).filter(Boolean)
    : [];
  if (requestedKeys.length > 0) {
    const missingKeys = requestedKeys.filter((key) => !catalog[key] || Number(catalog[key]?.price_usd || 0) <= 0);
    if (missingKeys.length > 0) {
      const fallbackEntries = await fetchFallbackPriceEntries(missingKeys);
      mergePriceCatalog(catalog, fallbackEntries);
    }
  }

  return buildCoinPriceCatalog(Object.values(catalog));
}

export async function fetchCoinGeckoSimplePrices(coinIds = []) {
  const ids = Array.isArray(coinIds)
    ? coinIds.map(normalizeCoinKey).filter(Boolean)
    : String(coinIds || "")
        .split(",")
        .map((value) => normalizeCoinKey(value))
        .filter(Boolean);

  if (ids.length === 0) return {};

  try {
    const url = new URL("https://api.coingecko.com/api/v3/simple/price");
    url.searchParams.set("ids", Array.from(new Set(ids)).join(","));
    url.searchParams.set("vs_currencies", "usd,btc");
    url.searchParams.set("include_24hr_change", "true");
    url.searchParams.set("include_24hr_vol", "true");
    url.searchParams.set("include_market_cap", "true");

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return {};

    const data = await response.json().catch(() => ({}));
    const entries = [];

    for (const id of ids) {
      const priceData = data?.[id];
      if (!priceData) continue;
      const symbol = COINGECKO_ID_TO_SYMBOL.get(id) || id.toUpperCase();
      entries.push(
        makePriceEntry({
          coinId: id,
          symbol,
          name: symbol,
          usd: priceData.usd || 0,
          btc: priceData.btc || 0,
          marketCap: priceData.usd_market_cap || 0,
          volume24h: priceData.usd_24h_vol || 0,
          change24h: priceData.usd_24h_change || 0,
          source: "coingecko",
        }),
      );
    }

    return buildCoinPriceCatalog(entries);
  } catch {
    return {};
  }
}
