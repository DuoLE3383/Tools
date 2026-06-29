// server/price-sources.js

/**
 * Defines and configures the various external APIs for fetching cryptocurrency prices.
 * @param {object} apiClient - The API client created by `createApiClient`.
 * @param {Map} idToSymbolMap - A map from CoinGecko ID to symbol.
 * @returns {object} An object containing configured price source fetchers.
 */
export function getPriceSources(apiClient, idToSymbolMap) {
  const sources = {
    coingecko: {
      async fetch() {
        const allResults = [];
        let page = 1;
        while (page <= 10) { // Safety limit
          const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${page}&sparkline=false&price_change_percentage=24h,7d,30d`;
          try {
            const response = await apiClient.fetchWithRetry('coingecko', url);
            if (!response.ok) break;
            const data = await response.json();
            if (!Array.isArray(data) || data.length === 0) break;

            allResults.push(...data);
            page++;
            await new Promise(r => setTimeout(r, 1500)); // Politeness delay
          } catch (error) {
            console.warn(`[PriceSource:CoinGecko] Error on page ${page}: ${error.message}`);
            break;
          }
        }
        return allResults.map(c => ({
          id: c.id,
          symbol: c.symbol.toUpperCase(),
          name: c.name,
          price_usd: c.current_price || 0,
          market_cap: c.market_cap || 0,
          volume_24h: c.total_volume || 0,
          price_change_24h: c.price_change_percentage_24h || 0,
          price_change_7d: c.price_change_percentage_7d_in_currency || 0,
          price_change_30d: c.price_change_percentage_30d_in_currency || 0,
          last_updated: c.last_updated || new Date().toISOString(),
          source: 'coingecko',
        }));
      }
    },

    cmc: {
      async fetch(coinIds) {
        if (!process.env.CMC_API) return [];
        const symbols = [...new Set(coinIds.map(id => idToSymbolMap.get(id?.toLowerCase())).filter(Boolean))];
        if (symbols.length === 0) return [];

        const results = [];
        for (let i = 0; i < symbols.length; i += 100) {
          const chunk = symbols.slice(i, i + 100);
          const url = `https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${chunk.join(',')}`;
          try {
            const response = await apiClient.fetchWithRetry('cmc', url, { headers: { 'X-CMC_PRO_API_KEY': process.env.CMC_API } });
            if (!response.ok) continue;
            const data = await response.json();
            if (!data.data) continue;

            Object.values(data.data).forEach(coinData => {
              const quote = coinData.quote?.USD;
              if (!quote) return;
              const symbol = coinData.symbol.toUpperCase();
              const coinId = coinIds.find(id => idToSymbolMap.get(id?.toLowerCase()) === symbol);
              if (coinId) {
                results.push({
                  id: coinId,
                  symbol: symbol,
                  name: coinData.name,
                  price_usd: quote.price || 0,
                  market_cap: quote.market_cap || 0,
                  volume_24h: quote.volume_24h || 0,
                  price_change_24h: quote.percent_change_24h || 0,
                  price_change_7d: quote.percent_change_7d || 0,
                  price_change_30d: quote.percent_change_30d || 0,
                  last_updated: coinData.last_updated || new Date().toISOString(),
                  source: 'cmc',
                });
              }
            });
          } catch (error) {
            console.warn(`[PriceSource:CMC] Chunk failed: ${error.message}`);
          }
        }
        return results;
      }
    },

    coindesk: {
      async fetch(coinIds) {
        const results = [];
        const btcId = coinIds.find(id => idToSymbolMap.get(id) === 'BTC');
        if (btcId) {
          try {
            const response = await apiClient.fetchWithRetry('coindesk', 'https://api.coindesk.com/v1/bpi/currentprice/BTC.json');
            if (response.ok) {
              const data = await response.json();
              const price = data?.bpi?.USD?.rate_float;
              if (price > 0) {
                results.push({ id: btcId, symbol: 'BTC', name: 'Bitcoin', price_usd: price, source: 'coindesk' });
              }
            }
          } catch (error) {
            console.warn(`[PriceSource:CoinDesk] BTC fetch failed: ${error.message}`);
          }
        }
        return results;
      }
    },

    blockchain: {
      async fetch(coinIds) {
        const topCoins = ['BTC', 'ETH', 'USDT', 'BNB', 'USDC', 'XRP', 'SOL', 'ADA', 'DOGE', 'TRX'];
        const symbols = coinIds.map(id => idToSymbolMap.get(id)).filter(s => topCoins.includes(s));
        if (symbols.length === 0) return [];

        try {
          const url = `https://www.blockchain.com/explorer/api/prices/ticker?symbols=${symbols.join(',')}`;
          const response = await apiClient.fetchWithRetry('blockchain', url);
          if (!response.ok) return [];

          const data = await response.json();
          if (!data?.prices) return [];

          return Object.entries(data.prices).map(([symbol, priceData]) => {
            const coinId = coinIds.find(id => idToSymbolMap.get(id) === symbol);
            if (!coinId) return null;
            return {
              id: coinId,
              symbol,
              name: symbol,
              price_usd: priceData.price || 0,
              market_cap: priceData.marketCap || 0,
              volume_24h: priceData.volume24h || 0,
              price_change_24h: priceData.percentChange24h || 0,
              last_updated: new Date().toISOString(),
              source: 'blockchain',
            };
          }).filter(Boolean);
        } catch (error) {
          console.warn(`[PriceSource:Blockchain] API error: ${error.message}`);
          return [];
        }
      }
    },

    // Add other sources (cryptocom, binance, kraken) here following the same pattern
    cryptocom: { async fetch() { return []; } },
    binance: { async fetch() { return []; } },
    kraken: { async fetch() { return []; } },
  };

  return sources;
}