// server/price-fetcher.js
import { db } from './db.js';
import { getCmcPrices } from './cmcClient.js';
import { dbAllAsync, dbRunAsync } from './mrr/db-utils.js';

/**
 * Custom error class for handling API rate limit responses (HTTP 429).
 */
class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Configuration
const PRICE_FETCH_CONFIG = {
  COINGECKO: {
    BASE_URL: 'https://api.coingecko.com/api/v3', // Free API endpoint
    RATE_LIMIT: 30, // Free tier: 30 calls per minute
    CHUNK_SIZE: 100, // Max coins per request (free tier allows up to 100)
    RETRY_DELAY: 5000,
    MAX_RETRIES: 3,
  },
  COINDESK: {
    BASE_URL: 'https://api.coindesk.com/v1',
    RATE_LIMIT: 30,
    RETRY_DELAY: 3000,
    MAX_RETRIES: 2,
  },
  CMC: {
    BASE_URL: 'https://pro-api.coinmarketcap.com/v1',
    RATE_LIMIT: 333,
    CHUNK_SIZE: 100,
    RETRY_DELAY: 10000,
    MAX_RETRIES: 2,
  },
  BLOCKCHAIN: {
    BASE_URL: 'https://www.blockchain.com/explorer/api',
    RATE_LIMIT: 10,
    CHUNK_SIZE: 100,
    RETRY_DELAY: 5000,
    MAX_RETRIES: 2,
  },
  CRYPTOCOM: {
    BASE_URL: 'https://api.crypto.com/v2',
    RATE_LIMIT: 20,
    CHUNK_SIZE: 50,
    RETRY_DELAY: 3000,
    MAX_RETRIES: 2,
  },
  BINANCE: {
    BASE_URL: 'https://api.binance.com/api/v3',
    RATE_LIMIT: 1200,
  },
  KRAKEN: {
    BASE_URL: 'https://api.kraken.com/0/public',
    RATE_LIMIT: 20,
  },
};

// Rate limiter implementation
class RateLimiter {
  constructor(maxRequests, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow;
    this.requests = [];
  }

  async wait() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.timeWindow);
    
    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldest) + 100;
      await new Promise(resolve => setTimeout(resolve, waitTime));
      return this.wait();
    }
    
    this.requests.push(now);
  }
}

// Source-specific rate limiters
const rateLimiters = {
  coingecko: new RateLimiter(PRICE_FETCH_CONFIG.COINGECKO.RATE_LIMIT, 60000),
  coindesk: new RateLimiter(PRICE_FETCH_CONFIG.COINDESK.RATE_LIMIT, 60000),
  cmc: new RateLimiter(PRICE_FETCH_CONFIG.CMC.RATE_LIMIT, 60000), // Switched to per-minute
  blockchain: new RateLimiter(PRICE_FETCH_CONFIG.BLOCKCHAIN.RATE_LIMIT, 60000),
  cryptocom: new RateLimiter(PRICE_FETCH_CONFIG.CRYPTOCOM.RATE_LIMIT, 60000),
  binance: new RateLimiter(PRICE_FETCH_CONFIG.BINANCE.RATE_LIMIT, 60000),
  kraken: new RateLimiter(PRICE_FETCH_CONFIG.KRAKEN.RATE_LIMIT, 60000),
};

// Cache for price data
const priceCache = new Map();
const CACHE_TTL = 60000;

// Retry helper with exponential backoff
async function fetchWithRetry(url, options = {}, maxRetries = 3, delay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'BenTreMiningTool/2.0',
          'Accept': 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        return response;
      }

      if (response.status === 429) {
        // Don't wait, throw a specific error to be caught by the caller.
        throw new RateLimitError(`Rate limited by API (status 429).`);
      }

      if (response.status >= 500) {
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`[PriceFetcher] Server error ${response.status}. Retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const backoffDelay = delay * Math.pow(2, attempt - 1);
        console.log(`[PriceFetcher] Fetch failed (attempt ${attempt}/${maxRetries}). Retrying in ${backoffDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Smart coin ID mapping for CoinGecko
const COINGECKO_ID_MAP = {
  'btc': 'bitcoin',
  'eth': 'ethereum',
  'usdt': 'tether',
  'bnb': 'binancecoin',
  'usdc': 'usd-coin',
  'xrp': 'ripple',
  'sol': 'solana',
  'ada': 'cardano',
  'doge': 'dogecoin',
  'trx': 'tron',
  'dot': 'polkadot',
  'link': 'chainlink',
  'xlm': 'stellar',
  'avax': 'avalanche-2',
  'shib': 'shiba-inu',
  'matic': 'matic-network',
  'uni': 'uniswap',
  'ltc': 'litecoin',
  'bch': 'bitcoin-cash',
  'xmr': 'monero',
  'etc': 'ethereum-classic',
  'algo': 'algorand',
  'atom': 'cosmos',
  'vet': 'vechain',
  'fil': 'filecoin',
  'aave': 'aave',
  'near': 'near',
  'apt': 'aptos',
  'arb': 'arbitrum',
  'op': 'optimism',
};

// Reverse map for symbol -> CoinGecko ID
const SYMBOL_TO_COINGECKO = {};
Object.entries(COINGECKO_ID_MAP).forEach(([symbol, id]) => {
  SYMBOL_TO_COINGECKO[symbol.toUpperCase()] = id;
});

// Price sources
const priceSources = {
  // PRIMARY: CoinGecko (Free tier - no API key required)
  coingecko: {
    async fetchPrices(coinIds) { // coinIds can be passed for targeted fetches, but we will fetch all here.
      await rateLimiters.coingecko.wait();
      
      // Use the free API endpoint (no API key required)
      const baseUrl = 'https://api.coingecko.com/api/v3';
      
      // Fetch all coins via pagination
      const PER_PAGE = 250; // Max allowed by CoinGecko
      const allResults = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page < 10) { // Limit to 10 pages to prevent infinite loops on API changes
        await rateLimiters.coingecko.wait(); // Wait before each page request
        
        // Free API endpoint - no authentication required
        const url = `${baseUrl}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${PER_PAGE}&page=${page}&sparkline=false&price_change_percentage=24h,7d,30d`;
        
        console.log(`[PriceFetcher] CoinGecko: fetching page ${page}...`);
        
        const response = await fetchWithRetry(url, {
          headers: {
            'Accept': 'application/json',
          },
        }, PRICE_FETCH_CONFIG.COINGECKO.MAX_RETRIES);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.warn(`[PriceFetcher] CoinGecko page ${page} failed with status ${response.status}: ${errorText.slice(0, 200)}`);
          
          // If we fail (including rate limit), just stop paginating and return what we have.
          hasMore = false;
          continue;
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
          console.warn('[PriceFetcher] Invalid response from CoinGecko');
          continue;
        }
        
        if (data.length > 0) {
          allResults.push(...data);
          page++;
          // Small delay between pages to be polite to the API
          await new Promise(resolve => setTimeout(resolve, 1500));
        } else {
          // No more data, stop pagination
          hasMore = false;
        }
      }
      
      if (allResults.length === 0) {
        console.warn('[PriceFetcher] No data returned from CoinGecko');
        return [];
      }
      
      console.log(`[PriceFetcher] CoinGecko returned ${allResults.length} coins`);
      
      return allResults.map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        price_usd: coin.current_price || 0,
        market_cap: coin.market_cap || 0,
        volume_24h: coin.total_volume || 0,
        price_change_24h: coin.price_change_percentage_24h || 0,
        price_change_7d: coin.price_change_percentage_7d_in_currency || 0,
        price_change_30d: coin.price_change_percentage_30d_in_currency || 0,
        last_updated: coin.last_updated || new Date().toISOString(),
        source: 'coingecko',
      }));
    },
  },

  // NEW: CoinDesk (for major coins - free, no API key)
  coindesk: {
    async fetchPrices(coinIds) {
      await rateLimiters.coindesk.wait();
      
      // CoinDesk only supports BTC and ETH primarily
      const supportedSymbols = ['BTC', 'ETH'];
      const symbols = coinIds
        .map(id => idToSymbolMap.get(id))
        .filter(symbol => supportedSymbols.includes(symbol));
      
      if (symbols.length === 0) return [];
      
      const results = [];
      
      // Fetch BTC price
      if (symbols.includes('BTC')) {
        try {
          const url = `${PRICE_FETCH_CONFIG.COINDESK.BASE_URL}/bpi/currentprice.json`;
          const response = await fetchWithRetry(url, {}, PRICE_FETCH_CONFIG.COINDESK.MAX_RETRIES);
          
          if (response.ok) {
            const data = await response.json();
            const btcPrice = data?.bpi?.USD?.rate_float || 0;
            
            if (btcPrice > 0) {
              const btcId = coinIds.find(id => idToSymbolMap.get(id) === 'BTC');
              if (btcId) {
                results.push({
                  id: btcId,
                  symbol: 'BTC',
                  name: 'Bitcoin',
                  price_usd: btcPrice,
                  market_cap: 0,
                  volume_24h: 0,
                  price_change_24h: 0,
                  last_updated: new Date().toISOString(),
                  source: 'coindesk',
                });
              }
            }
          }
        } catch (error) {
          console.warn(`[PriceFetcher] CoinDesk BTC fetch failed: ${error.message}`);
        }
      }
      
      // Fetch ETH price if needed
      if (symbols.includes('ETH')) {
        try {
          // CoinDesk doesn't have a direct ETH endpoint, use their index API
          const url = `${PRICE_FETCH_CONFIG.COINDESK.BASE_URL}/bpi/currentprice/ETH.json`;
          const response = await fetchWithRetry(url, {}, PRICE_FETCH_CONFIG.COINDESK.MAX_RETRIES);
          
          if (response.ok) {
            const data = await response.json();
            const ethPrice = data?.bpi?.USD?.rate_float || 0;
            
            if (ethPrice > 0) {
              const ethId = coinIds.find(id => idToSymbolMap.get(id) === 'ETH');
              if (ethId) {
                results.push({
                  id: ethId,
                  symbol: 'ETH',
                  name: 'Ethereum',
                  price_usd: ethPrice,
                  market_cap: 0,
                  volume_24h: 0,
                  price_change_24h: 0,
                  last_updated: new Date().toISOString(),
                  source: 'coindesk',
                });
              }
            }
          }
        } catch (error) {
          console.warn(`[PriceFetcher] CoinDesk ETH fetch failed: ${error.message}`);
        }
      }
      
      return results;
    },
  },

  cmc: {
    async fetchPrices(coinIds) {
      if (!process.env.CMC_API) {
        // This is expected if no key is provided, so no need to log every time.
        return [];
      }
      
      await rateLimiters.cmc.wait();
      
      // CMC works best with symbols. Map the IDs we have to symbols.
      const symbols = coinIds.map(id => idToSymbolMap.get(id?.toLowerCase())).filter(Boolean);
      if (symbols.length === 0) return [];
      
      // Chunk symbols to respect API limits
      const CHUNK_SIZE = PRICE_FETCH_CONFIG.CMC.CHUNK_SIZE;
      const results = [];

      for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
        const chunk = symbols.slice(i, i + CHUNK_SIZE);
        const url = `${PRICE_FETCH_CONFIG.CMC.BASE_URL}/cryptocurrency/quotes/latest?symbol=${chunk.join(',')}`;
        
        try {
            const response = await fetchWithRetry(url, {
                headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API },
            }, PRICE_FETCH_CONFIG.CMC.MAX_RETRIES);

            if (!response.ok) continue;

            const data = await response.json();
            if (!data.data) continue;

            Object.values(data.data).forEach(coinData => {
                const symbol = coinData.symbol.toUpperCase();
                const coinId = coinIds.find(id => idToSymbolMap.get(id?.toLowerCase()) === symbol);
                if (!coinId) return;

                results.push({
                    id: coinId,
                    symbol: symbol,
                    name: coinData.name || symbol,
                    price_usd: coinData.quote?.USD?.price || 0,
                    market_cap: coinData.quote?.USD?.market_cap || 0,
                    volume_24h: coinData.quote?.USD?.volume_24h || 0,
                    price_change_24h: coinData.quote?.USD?.percent_change_24h || 0,
                    price_change_7d: coinData.quote?.USD?.percent_change_7d || 0,
                    price_change_30d: coinData.quote?.USD?.percent_change_30d || 0,
                    last_updated: coinData.last_updated || new Date().toISOString(),
                    source: 'cmc',
                });
            });
        } catch (error) {
            console.warn(`[PriceFetcher] CMC chunk failed: ${error.message}`);
        }
      }
      return results;
    },
  },

  blockchain: {
    async fetchPrices(coinIds) {
      await rateLimiters.blockchain.wait();
      
      const topCoins = ['BTC', 'ETH', 'USDT', 'BNB', 'USDC', 'XRP', 'SOL', 'ADA', 'DOGE', 'TRX'];
      const requestedSymbols = coinIds
        .map(id => idToSymbolMap.get(id))
        .filter(symbol => topCoins.includes(symbol));
      
      if (requestedSymbols.length === 0) return [];
      
      try {
          const url = `https://www.blockchain.com/explorer/api/prices/ticker?symbols=${requestedSymbols.join(',')}`;
          const response = await fetchWithRetry(url, {}, 2);
          
          if (response.ok) {
              const data = await response.json();
              if (data && data.prices) {
                  return Object.entries(data.prices).map(([symbol, priceData]) => {
                      const coinId = coinIds.find(id => idToSymbolMap.get(id) === symbol);
                      if (!coinId) return null;
                      
                      return {
                          id: coinId,
                          symbol: symbol,
                          name: symbol,
                          price_usd: priceData.price || 0,
                          market_cap: priceData.marketCap || 0,
                          volume_24h: priceData.volume24h || 0,
                          price_change_24h: priceData.percentChange24h || 0,
                          last_updated: new Date().toISOString(),
                          source: 'blockchain',
                      };
                  }).filter(Boolean);
              }
          }
          // If response is not OK, just return empty and let the next source try.
          return [];
      } catch (error) {
        console.warn(`[PriceFetcher] Blockchain.com API error: ${error.message}. Skipping source.`);
        return [];
      }
    },
  },

  cryptocom: {
    async fetchPrices(coinIds) {
      await rateLimiters.cryptocom.wait();
      
      const symbols = coinIds
        .map(id => idToSymbolMap.get(id))
        .filter(Boolean)
        .slice(0, 20);
      
      if (symbols.length === 0) return [];
      
      try {
        const url = `${PRICE_FETCH_CONFIG.CRYPTOCOM.BASE_URL}/public/get-ticker?instrument_name=${symbols.map(s => `${s}_USD`).join(',')}`;
        const response = await fetchWithRetry(url, {}, 2);
        
        if (!response.ok) {
          return [];
        }
        
        const data = await response.json();
        
        if (!data.result || !data.result.data) {
          return [];
        }
        
        return data.result.data.map(ticker => {
          const symbol = ticker.instrument_name.replace('_USD', '');
          const coinId = coinIds.find(id => idToSymbolMap.get(id) === symbol);
          if (!coinId) return null;
          
          return {
            id: coinId,
            symbol: symbol,
            name: symbol,
            price_usd: parseFloat(ticker.last_price) || 0,
            market_cap: 0,
            volume_24h: parseFloat(ticker.volume_24h) || 0,
            price_change_24h: parseFloat(ticker.price_change_24h) || 0,
            last_updated: new Date().toISOString(),
            source: 'cryptocom',
          };
        }).filter(Boolean);
      } catch (error) {
        console.warn(`[PriceFetcher] Crypto.com API error: ${error.message}`);
        return [];
      }
    },
  },
  
  binance: {
    async fetchPrices(coinIds) {
      await rateLimiters.binance.wait();
      const results = [];
      const symbols = coinIds.map(id => idToSymbolMap.get(id)).filter(Boolean);
      const topSymbols = symbols.slice(0, 20);
      
      for (const symbol of topSymbols) {
        await rateLimiters.binance.wait(); // Wait for each symbol to avoid bursting
        try {
          const url = `${PRICE_FETCH_CONFIG.BINANCE.BASE_URL}/ticker/24hr?symbol=${symbol}USDT`;
          const response = await fetchWithRetry(url, {}, 1);
          
          if (!response.ok) continue;
          
          const data = await response.json();
          
          results.push({
            id: coinIds.find(id => idToSymbolMap.get(id) === symbol) || symbol,
            symbol: symbol,
            name: symbol,
            price_usd: parseFloat(data.lastPrice) || 0,
            market_cap: 0,
            volume_24h: parseFloat(data.volume) || 0,
            price_change_24h: parseFloat(data.priceChangePercent) || 0,
            last_updated: new Date().toISOString(),
            source: 'binance',
          });
        } catch (error) {
          // Skip failed individual fetches
        }
      }
      
      return results;
    },
  },
  
  kraken: {
    async fetchPrices(coinIds) {
      await rateLimiters.kraken.wait();
      const symbols = coinIds.map(id => idToSymbolMap.get(id)).filter(Boolean);
      const krakenPairs = symbols
        .filter(s => ['BTC', 'ETH', 'XRP', 'ADA', 'DOT', 'LINK', 'LTC', 'BCH', 'XLM', 'UNI'].includes(s))
        .map(s => `${s}USD`)
        .join(',');
      
      if (!krakenPairs) return [];
      
      try {
        const url = `${PRICE_FETCH_CONFIG.KRAKEN.BASE_URL}/Ticker?pair=${krakenPairs}`;
        const response = await fetchWithRetry(url, {}, 1);
        
        if (!response.ok) return [];
        
        const data = await response.json();
        
        if (!data.result) return [];
        
        return Object.entries(data.result).map(([pair, ticker]) => {
          const symbol = pair.replace('USD', '');
          return {
            id: coinIds.find(id => idToSymbolMap.get(id) === symbol) || symbol,
            symbol: symbol,
            name: symbol,
            price_usd: parseFloat(ticker.c[0]) || 0,
            market_cap: 0,
            volume_24h: parseFloat(ticker.v[1]) || 0,
            price_change_24h: 0,
            last_updated: new Date().toISOString(),
            source: 'kraken',
          };
        });
      } catch (error) {
        return [];
      }
    },
  },
};

// Remove broken scrape fallback – use API-only approach

// Make idToSymbolMap accessible globally
let idToSymbolMap = new Map();

/**
 * Initializes the database and maps for coin fetching.
 */
async function initializeFetcher() {
  await dbRunAsync(db, `
    CREATE TABLE IF NOT EXISTS coingecko_coins (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const coingeckoCoins = await dbAllAsync(db, 'SELECT DISTINCT id, symbol FROM coingecko_coins WHERE id IS NOT NULL');
  idToSymbolMap = new Map(coingeckoCoins.map(c => [c.id.toLowerCase(), c.symbol.toUpperCase()]));
}

/**
 * Gets the master list of coin IDs to fetch prices for.
 * Prioritizes a fresh list from CoinGecko, but falls back to the DB cache.
 */
async function getTargetCoinList() {
  try {
    console.log('[PriceFetcher] 🌐 Attempting to get latest coin list from CoinGecko...');
    const allCoins = await priceSources.coingecko.fetchPrices();
    if (allCoins.length > 0) {
      console.log(`[PriceFetcher] ✅ Got ${allCoins.length} coins from CoinGecko.`);
      // Update our reference table for coingecko IDs and symbols
      await dbRunAsync(db, 'BEGIN TRANSACTION');
      const stmt = db.prepare('INSERT OR REPLACE INTO coingecko_coins (id, symbol, name, last_updated) VALUES (?, ?, ?, ?)');
      for (const coin of allCoins) {
        await new Promise((resolve, reject) => {
          stmt.run(coin.id, coin.symbol, coin.name, new Date().toISOString(), (err) => err ? reject(err) : resolve());
        });
      }
      await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
      await dbRunAsync(db, 'COMMIT');

      // Re-initialize the map with the latest data
      await initializeFetcher();
      return allCoins; // Return the full coin objects
    }
    console.warn('[PriceFetcher] ⚠️ CoinGecko returned 0 coins. Falling back to DB cache.');
  } catch (error) {
    console.warn(`[PriceFetcher] ⚠️ CoinGecko failed: ${error.message}. Falling back to DB cache.`);
  }

  // Fallback to database cache
  const cachedCoins = await dbAllAsync(db, 'SELECT id, symbol, name FROM coingecko_coins');
  console.log(`[PriceFetcher] ℹ️ Using ${cachedCoins.length} coins from database cache.`);
  return cachedCoins.map(c => ({ ...c, source: 'cached' }));
}

/**
 * Merges new coin data into the existing results, filling gaps.
 */
function mergeCoinData(existingCoins, newCoins) {
  const existingMap = new Map(existingCoins.map(c => [c.id, c]));
  let newCoinsAdded = 0;
  newCoins.forEach(coin => {
    const existingCoin = existingMap.get(coin.id);
    // Add if it's a new coin, or if the existing coin has a price of 0
    if (!existingCoin || (existingCoin.price_usd === 0 && coin.price_usd > 0)) {
      existingMap.set(coin.id, coin);
      if (!existingCoin) newCoinsAdded++;
    }
  });
  return { merged: Array.from(existingMap.values()), newCount: newCoinsAdded };
}

/**
 * Fetches prices from a prioritized list of sources and stores them.
 */
async function fetchAndSyncPrices() {
  const initialCoinList = await getTargetCoinList();
  if (initialCoinList.length === 0) {
    throw new Error('Could not retrieve any coins to process, neither from API nor cache.');
  }

  let allFetchedCoins = initialCoinList.filter(c => c.source !== 'cached');
  const allCoinIds = initialCoinList.map(c => c.id);
  const failedSources = [];
  const sourceStats = {};

  if (allFetchedCoins.length > 0) {
      sourceStats.coingecko = { count: allFetchedCoins.length };
  }

  // Define the fallback chain
  const fallbackSources = [
    { name: 'coindesk', enabled: true },
    { name: 'cmc', enabled: !!process.env.CMC_API },
    { name: 'blockchain', enabled: true },
    { name: 'cryptocom', enabled: true },
    { name: 'binance', enabled: true },
    { name: 'kraken', enabled: true },
  ];

  for (const source of fallbackSources) {
    if (!source.enabled) continue;

    // Stop if we have good data for most coins
    const coinsWithPrice = allFetchedCoins.filter(c => c.price_usd > 0).length;
    if (coinsWithPrice / allCoinIds.length > 0.95 && allFetchedCoins.length > 100) {
        console.log(`[PriceFetcher] ℹ️ Sufficient price coverage (${coinsWithPrice}/${allCoinIds.length}). Halting fallback chain.`);
        break;
    }

    try {
      console.log(`[PriceFetcher] 🌐 Attempting ${source.name}...`);
      const startTime = Date.now();
      const newCoins = await priceSources[source.name].fetchPrices(allCoinIds);
      const duration = Date.now() - startTime;

      if (newCoins.length > 0) {
        const { merged, newCount } = mergeCoinData(allFetchedCoins, newCoins);
        allFetchedCoins = merged;
        sourceStats[source.name] = { count: newCoins.length, duration: `${duration}ms` };
        console.log(`[PriceFetcher] ✅ ${source.name}: Added/updated ${newCoins.length} coins in ${duration}ms.`);
      }
    } catch (error) {
      if (error.name === 'RateLimitError') {
        console.warn(`[PriceFetcher] ⚠️ ${source.name} is rate-limited. Switching to next source.`);
      } else {
        console.warn(`[PriceFetcher] ⚠️ ${source.name} failed: ${error.message}`);
      }
    }
  }
  return { allFetchedCoins, failedSources, sourceStats };
}

/**
 * Stores the final list of fetched coins into the database.
 */
async function storePricesInDB(coins) {
  if (coins.length === 0) {
    throw new Error('All price sources failed. No data retrieved to store.');
  }

  const btcCoin = coins.find(c => c.symbol === 'BTC' || c.id === 'bitcoin');
  const btcPriceUsd = btcCoin?.price_usd || 0;

  if (btcPriceUsd === 0) {
    console.warn('[PriceFetcher] ⚠️ BTC price is 0, cannot calculate price_btc for other coins.');
  }

  const capturedAt = new Date().toISOString();
  await dbRunAsync(db, 'BEGIN TRANSACTION');
  try {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO coin_prices 
      (coin_id, coin_name, symbol, price_usd, price_btc, market_cap, volume_24h, 
       price_change_24h, price_change_7d, price_change_30d, last_updated, captured_at, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `);

    for (const coin of coins) {
      const priceUsd = coin.price_usd || 0;
      const priceBtc = btcPriceUsd > 0 ? priceUsd / btcPriceUsd : 0;
      await new Promise((resolve, reject) => {
        stmt.run(
          coin.id, coin.name || coin.symbol, coin.symbol.toUpperCase(),
          priceUsd, priceBtc, coin.market_cap || 0, coin.volume_24h || 0,
          coin.price_change_24h || 0, coin.price_change_7d || 0, coin.price_change_30d || 0,
          coin.last_updated || capturedAt, capturedAt, coin.source || 'unknown',
          (err) => err ? reject(err) : resolve()
        );
      });
    }

    await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));
    await dbRunAsync(db, 'COMMIT');

    console.log(`[PriceFetcher] ✅ Successfully synced ${coins.length} coins to coin_prices table.`);
    console.log(`[PriceFetcher] 💰 BTC Price: $${btcPriceUsd.toFixed(2)}`);
  } catch (dbError) {
    console.error('[PriceFetcher] Database transaction failed. Rolling back.', dbError.message);
    await dbRunAsync(db, 'ROLLBACK');
    throw dbError;
  }
}
/**
 * Ensures the coin_prices table has all necessary columns.
 */
async function migrateCoinPricesTable() {
  try {
    const columns = await dbAllAsync(db, `PRAGMA table_info(coin_prices)`);
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('price_change_7d')) {
      console.log('[DB Migration] Adding price_change_7d to coin_prices...');
      await dbRunAsync(db, `ALTER TABLE coin_prices ADD COLUMN price_change_7d REAL DEFAULT 0`);
    }
    if (!columnNames.includes('price_change_30d')) {
      console.log('[DB Migration] Adding price_change_30d to coin_prices...');
      await dbRunAsync(db, `ALTER TABLE coin_prices ADD COLUMN price_change_30d REAL DEFAULT 0`);
    }
  } catch (error) {
    console.error(`[DB Migration] Failed to migrate coin_prices table: ${error.message}`);
  }
}

// Main fetching function
export async function fetchAndStoreCoinPrices() {
  console.log('[PriceFetcher] Starting coin price update job...');
  try {
    await initializeFetcher();
    const { allFetchedCoins, failedSources, sourceStats } = await fetchAndSyncPrices();
    await migrateCoinPricesTable();
    
    console.log(`[PriceFetcher] 📊 Total unique coins with data: ${allFetchedCoins.length}`);
    console.log(`[PriceFetcher] 📊 Source stats:`, sourceStats);
    if (failedSources.length > 0) {
      console.log(`[PriceFetcher] 📊 Failed sources: ${failedSources.join(', ')}`);
    }

    await storePricesInDB(allFetchedCoins);

  } catch (error) {
    console.error('[PriceFetcher] ❌ Critical error during price update:', error.message);
    // Optional: Send alert for critical failures
  }
}

// Exponential backoff for the entire job
export function startPriceFetcherJob(intervalMinutes = 15) {
  const intervalMs = intervalMinutes * 60 * 1000;
  console.log(`[PriceFetcher] Scheduling coin price updates every ${intervalMinutes} minutes.`);
  
  let consecutiveFailures = 0;
  let currentInterval = intervalMs;
  
  async function runWithBackoff() {
    try {
      await fetchAndStoreCoinPrices();
      consecutiveFailures = 0;
      currentInterval = intervalMs;
    } catch (error) {
      consecutiveFailures++;
      
      const backoffFactor = Math.min(Math.pow(2, consecutiveFailures - 1), 8);
      currentInterval = Math.min(intervalMs * backoffFactor, intervalMs * 8);
      
      console.log(`[PriceFetcher] Backing off. Next run in ${currentInterval / 60000} minutes`);
    }
    
    setTimeout(runWithBackoff, currentInterval);
  }
  
  setTimeout(runWithBackoff, 5000);
}

// Manual trigger endpoint support
export async function triggerPriceUpdate(req, res) {
  try {
    await fetchAndStoreCoinPrices();
    res.json({ success: true, message: 'Price update triggered successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
}

// Export for testing
export { idToSymbolMap };
