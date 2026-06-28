// server/cmcClient.js
let cachedPrices = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

export async function getCmcPrices(symbols) {
  const now = Date.now();

  const apiKey = process.env.CMC_API;
  if (!apiKey) {
    throw new Error('CMC_API_KEY is not set in environment');
  }

  // Filter out symbols that are already in the cache and not expired
  const symbolsToFetch = (symbols || []).map(s => s.toUpperCase()).filter(s => {
    const cached = cachedPrices.get(s);
    return !cached || (now - (cached.timestamp || 0) > CACHE_TTL);
  });

  // If all symbols are cached, build the result from the cache
  if (symbolsToFetch.length === 0 && symbols.length > 0) {
    const result = {};
    symbols.forEach(s => {
      const upperSymbol = s.toUpperCase();
      if (cachedPrices.has(upperSymbol)) {
        result[upperSymbol] = cachedPrices.get(upperSymbol).data;
      }
    });
    return result;
  }

  const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbolsToFetch.join(',')}`;
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
  if (data.status?.error_code !== 0 && data.status?.error_code !== 400) { // Ignore 400 for "invalid symbol"
    throw new Error(`CMC API error: ${data.status?.error_message || 'Unknown error'}`);
  }

  const btcUsd = data.data?.BTC?.quote?.USD?.price;
  if (!btcUsd) {
    throw new Error('Could not retrieve BTC price from CMC');
  }

  for (const [symbol, info] of Object.entries(data.data || {})) {
    const upperSymbol = symbol.toUpperCase();
    const usd = info.quote?.USD?.price;
    if (!usd) continue;
    const btc = usd / btcUsd;
    cachedPrices.set(upperSymbol, { data: { usd, btc }, timestamp: now });
  }

  // Construct the final result object from the (now updated) cache
  const finalResult = {};
  (symbols || []).forEach(s => {
    const upperSymbol = s.toUpperCase();
    if (cachedPrices.has(upperSymbol)) {
      finalResult[upperSymbol] = cachedPrices.get(upperSymbol).data;
    }
  });

  return finalResult;
}