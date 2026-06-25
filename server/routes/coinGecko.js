// server/routes/coinGecko.js
import { getCoinPrice, getAllCoins, getCoinData } from '../coinFetcher.js';
import { asyncHandler } from '../utils.js';

export function registerCoinGeckoRoutes(app) {
  // Endpoint for the price modal (Gecko)
  app.get('/api/v2/price/coingecko', asyncHandler(async (req, res) => {
    const { coinId, symbol } = req.query;
    const targetSymbol = coinId || symbol;
    if (!targetSymbol) {
      return res.status(400).json({ error: 'coinId or symbol is required' });
    }
    const data = await getCoinData(targetSymbol, 'coingecko');
    if (data) {
      res.json({ success: true, data });
    } else {
      res.status(404).json({ success: false, error: 'Coin not found' });
    }
  }));

  // Endpoint for the price modal (CMC)
  app.get('/api/v2/price/cmc', asyncHandler(async (req, res) => {
    const { symbol } = req.query;
    if (!symbol) {
      return res.status(400).json({ error: 'symbol is required' });
    }
    const data = await getCoinData(symbol, 'cmc');
    if (data) {
      res.json({ success: true, data });
    } else {
      res.status(404).json({ success: false, error: 'Coin not found' });
    }
  }));

  // Keep original routes for any other potential usage
  app.get('/api/coin/price/:symbol', asyncHandler(async (req, res) => {
    const data = await getCoinPrice(req.params.symbol);
    if (data) res.json(data);
    else res.status(404).json({ error: 'Coin not found' });
  }));

  const topCoinsHandler = asyncHandler(async (req, res) => {
    const data = await getAllCoins(req.params.source || 'coingecko', parseInt(req.query.limit) || 100);
    res.json(data);
  });

  // Define two routes to handle the optional parameter correctly
  app.get('/api/coins/top', topCoinsHandler);
  app.get('/api/coins/top/:source', topCoinsHandler);
}