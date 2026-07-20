// server/routes/priceProviders.js

const fallbackCache = new Map();
const FALLBACK_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- Fallback Providers ---

export async function fetchFromCoinGecko(coinId) {
    try {
        console.log(`[PriceFallback] Trying CoinGecko for ${coinId}...`);
        const liveUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd,btc`;
        const liveRes = await fetch(liveUrl, { signal: AbortSignal.timeout(8000) });
        if (liveRes.ok) {
            const liveData = await liveRes.json();
            if (liveData[coinId] && liveData[coinId].usd > 0) {
                console.log(`[PriceFallback] Success from CoinGecko for ${coinId}.`);
                return {
                    usd: liveData[coinId].usd,
                    btc: liveData[coinId].btc || 0,
                    last_updated: new Date().toISOString(),
                    source: 'coingecko_live'
                };
            }
        }
    } catch (err) {
        console.warn(`[PriceFallback] CoinGecko fetch for ${coinId} failed: ${err.message}`);
    }
    return null;
}

export async function fetchFromCoinMarketCap(symbol) {
    if (!process.env.CMC_API) return null;

    const cacheKey = `cmc_fallback_${symbol}`;
    const cached = fallbackCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < FALLBACK_CACHE_TTL)) {
        console.log(`[PriceFallback] Using cached CMC price for ${symbol}.`);
        return cached.data;
    }

    try {
        console.log(`[PriceFallback] Trying CoinMarketCap for ${symbol}...`);
        const cmcUrl = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${symbol}`;
        const cmcRes = await fetch(cmcUrl, {
            headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API, 'Accept': 'application/json' },
            signal: AbortSignal.timeout(8000)
        });
        if (cmcRes.ok) {
            const cmcData = await cmcRes.json();
            const price = cmcData?.data?.[symbol]?.quote?.USD?.price;
            if (price > 0) {
                console.log(`[PriceFallback] Success from CMC for ${symbol}.`);
                const coinData = {
                    usd: price,
                    btc: 0, // Not provided by this endpoint
                    last_updated: new Date().toISOString(),
                    source: 'cmc_live'
                };
                fallbackCache.set(cacheKey, { data: coinData, timestamp: Date.now() });
                return coinData;
            }
        }
    } catch (err) {
        console.warn(`[PriceFallback] CMC fetch for ${symbol} failed: ${err.message}`);
    }
    return null;
}

export async function fetchFromCryptoCompare(symbol) {
    if (!process.env.CRYPTOCOMPARE_API_KEY) return null;

    const cacheKey = `cc_fallback_${symbol}`;
    const cached = fallbackCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < FALLBACK_CACHE_TTL)) {
        console.log(`[PriceFallback] Using cached CryptoCompare price for ${symbol}.`);
        return cached.data;
    }

    try {
        console.log(`[PriceFallback] Trying CryptoCompare for ${symbol}...`);
        const ccUrl = `https://min-api.cryptocompare.com/data/price?fsym=${symbol}&tsyms=USD,BTC&api_key=${process.env.CRYPTOCOMPARE_API_KEY}`;
        const ccRes = await fetch(ccUrl, { signal: AbortSignal.timeout(8000) });
        if (ccRes.ok) {
            const ccData = await ccRes.json();
            if (ccData?.USD > 0) {
                console.log(`[PriceFallback] Success from CryptoCompare for ${symbol}.`);
                const coinData = { usd: ccData.USD, btc: ccData.BTC || 0, last_updated: new Date().toISOString(), source: 'cryptocompare_live' };
                fallbackCache.set(cacheKey, { data: coinData, timestamp: Date.now() });
                return coinData;
            }
        }
    } catch (err) {
        console.warn(`[PriceFallback] CryptoCompare fetch for ${symbol} failed: ${err.message}`);
    }
    return null;
}

export async function fetchFromKraken(symbol) {
    // Kraken doesn't require an API key for public ticker data
    // It uses its own pair symbols, e.g., XBT for BTC. We'll try the common symbol first.
    const krakenSymbol = `${symbol.toUpperCase()}USD`;
    const cacheKey = `kraken_fallback_${symbol}`;
    const cached = fallbackCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < FALLBACK_CACHE_TTL)) {
        console.log(`[PriceFallback] Using cached Kraken price for ${symbol}.`);
        return cached.data;
    }

    try {
        console.log(`[PriceFallback] Trying Kraken for ${symbol}...`);
        const krakenUrl = `https://api.kraken.com/0/public/Ticker?pair=${krakenSymbol}`;
        const krakenRes = await fetch(krakenUrl, { signal: AbortSignal.timeout(8000) });
        if (krakenRes.ok) {
            const krakenData = await krakenRes.json();
            if (krakenData.error && krakenData.error.length > 0) return null;
            
            const resultKey = Object.keys(krakenData.result || {})[0];
            const price = parseFloat(krakenData.result?.[resultKey]?.c?.[0]); // 'c' is last trade closed [price, volume]

            if (price > 0) {
                console.log(`[PriceFallback] Success from Kraken for ${symbol}.`);
                const coinData = { usd: price, btc: 0, last_updated: new Date().toISOString(), source: 'kraken_live' };
                fallbackCache.set(cacheKey, { data: coinData, timestamp: Date.now() });
                return coinData;
            }
        }
    } catch (err) {
        console.warn(`[PriceFallback] Kraken fetch for ${symbol} failed: ${err.message}`);
    }
    return null;
}

export function clearFallbackCache() {
    fallbackCache.clear();
    console.log('[PriceFallback] Cache cleared.');
}