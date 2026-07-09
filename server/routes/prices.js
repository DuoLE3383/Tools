// server/routes/prices.js
import express from 'express';
import { getCoinPrice, getPricesForCoins } from '../coinGecko/coinGeckoClient.js';

const router = express.Router();

const symbolToId = {
  'RVN': 'ravencoin',
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'LTC': 'litecoin',
  'DOGE': 'dogecoin',
  'BCH': 'bitcoin-cash',
  'ETC': 'ethereum-classic',
  // ... add more mappings
};

router.get('/db/:coin', async (req, res) => {
  const { coin } = req.params;
  
  const coinId = symbolToId[coin.toUpperCase()];
  if (!coinId) {
    return res.json({
      success: false,
      error: `Coin ${coin} not found`,
      data: { symbol: coin.toUpperCase(), price_usd: 0, price_btc: 0 }
    });
  }

  try {
    const priceData = await getCoinPrice(coinId);
    res.json({
      success: true,
      data: {
        id: coinId,
        symbol: coin.toUpperCase(),
        price_usd: priceData.usd || 0,
        price_btc: priceData.btc || 0,
        market_cap: priceData.market_cap || 0,
        volume_24h: priceData.volume_24h || 0,
        price_change_24h: priceData.price_change_24h || 0,
        last_updated: new Date().toISOString()
      }
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      data: { symbol: coin.toUpperCase(), price_usd: 0, price_btc: 0 }
    });
  }
});

router.get('/db', async (req, res) => {
  const { coins } = req.query;
  const coinList = coins ? coins.split(',') : ['bitcoin', 'ethereum'];
  
  try {
    const prices = await getPricesForCoins(coinList);
    res.json({ success: true, data: prices });
  } catch (error) {
    res.json({ success: false, error: error.message, data: {} });
  }
});

export default router;