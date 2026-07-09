// server/coinGecko/coinGeckoService.js
import axios from 'axios';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const CACHE = new Map();
const CACHE_TTL = 30000; // 30 seconds

// Get price for a single coin
export async function getCoinPrice(coinId, vsCurrency = 'usd') {
  const cacheKey = `price:${coinId}:${vsCurrency}`;
  const cached = CACHE.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/simple/price`, {
      params: {
        ids: coinId,
        vs_currencies: vsCurrency,
      },
      timeout: 10000,
    });
    
    const data = response.data[coinId]?.[vsCurrency] || 0;
    CACHE.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`[CoinGecko] Failed to get price for ${coinId}:`, error.message);
    return 0;
  }
}

// Get prices for multiple coins
export async function getPricesForCoins(coinIds, vsCurrencies = ['usd', 'btc']) {
  const cacheKey = `prices:${coinIds.join(',')}:${vsCurrencies.join(',')}`;
  const cached = CACHE.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    const response = await axios.get(`${BASE_URL}/simple/price`, {
      params: {
        ids: coinIds.join(','),
        vs_currencies: vsCurrencies.join(','),
        include_24hr_change: true,
        include_market_cap: true,
        include_24hr_vol: true,
      },
      timeout: 10000,
    });
    
    const data = response.data || {};
    CACHE.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    console.error(`[CoinGecko] Failed to get prices:`, error.message);
    return {};
  }
}

// Get coin market data
export async function getCoinMarketData(coinId, vsCurrency = 'usd') {
  try {
    const response = await axios.get(`${BASE_URL}/coins/${coinId}`, {
      params: {
        localization: false,
        tickers: false,
        market_data: true,
        community_data: false,
        developer_data: false,
      },
      timeout: 10000,
    });
    
    return response.data;
  } catch (error) {
    console.error(`[CoinGecko] Failed to get market data for ${coinId}:`, error.message);
    return null;
  }
}

// Get trending coins
export async function getTrendingCoins() {
  try {
    const response = await axios.get(`${BASE_URL}/search/trending`, {
      timeout: 10000,
    });
    return response.data?.coins || [];
  } catch (error) {
    console.error('[CoinGecko] Failed to get trending coins:', error.message);
    return [];
  }
}

// Clear cache
export function clearCoinCache() {
  CACHE.clear();
  console.log('[CoinGecko] Cache cleared');
}