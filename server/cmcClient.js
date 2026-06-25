// server/cmcClient.js
import { getAllCoins } from './coinFetcher.js';

/**
 * Retrieves all coin prices from the local database (populated by coinFetcher.js)
 * instead of making a live API call to CoinMarketCap.
 * @param {string[]} symbols - List of coin symbols (e.g., ['BTC', 'ETH']).
 * @returns {Promise<object>} A map of coin data keyed by symbol.
 */
export async function getCmcPrices(symbols) {
  // Fetch all coins from the database, which is the single source of truth.
  const allCoins = await getAllCoins('cmc', 20000);
  const btcData = allCoins.find(c => c.symbol === 'BTC');
  const btcPrice = btcData?.price_usd || 0;
  
  const priceMap = {};
  allCoins.forEach(coin => {
    priceMap[coin.symbol.toLowerCase()] = {
      usd: coin.price_usd,
      btc: btcPrice > 0 ? coin.price_usd / btcPrice : 0,
    };
  });
  
  // Return only the requested symbols
  const requestedPrices = {};
  symbols.forEach(symbol => {
    if (priceMap[symbol.toLowerCase()]) {
      requestedPrices[symbol.toLowerCase()] = priceMap[symbol.toLowerCase()];
    }
  });
  
  return requestedPrices;
}