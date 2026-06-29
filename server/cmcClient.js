// server/cmcClient.js
let cachedPrices = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getCmcPrices(symbols) {
  const now = Date.now();
  if (cachedPrices && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPrices;
  }

  const apiKey = process.env.CMC_API;
  if (!apiKey) {
    throw new Error('CMC_API_KEY is not set in environment');
  }

  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbols.join(',')}`;
  const response = await fetch(url, {
    headers: {
      'X-CMC_PRO_API_KEY': apiKey,
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`CMC API error (${response.status}): ${text}`);
  }

  const data = await response.json();
  if (data.status?.error_code !== 0) {
    throw new Error(`CMC API error: ${data.status?.error_message || 'Unknown error'}`);
  }

  const result = {};
  const btcUsd = data.data?.BTC?.quote?.USD?.price;
  if (!btcUsd) {
    throw new Error('Could not retrieve BTC price from CMC');
  }

  for (const [symbol, info] of Object.entries(data.data || {})) {
    const usd = info.quote?.USD?.price;
    if (!usd) continue;
    const btc = usd / btcUsd;
    const coinId = symbol.toLowerCase(); // e.g., "btc", "bch"
    result[coinId] = { usd, btc };
  }

  cachedPrices = result;
  cacheTimestamp = now;
  return result;
}