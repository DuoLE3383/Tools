// server/routes/nicehash-update-rates.js
// Batch update NiceHash order prices to match current market rates
import { resolveNhClient, getNiceHashApp, nhConfigs, isAggregate, normalizeAlgoForNiceHash } from "../nh.js";
import { normalizeAlgo, getNiceHashUnit } from "../../src/core/mapping.js";

/**
 * Fetch current market price for an algorithm across all NH clients.
 * Returns the best available price.
 */
async function fetchMarketPrice(algorithm, market = 'USA') {
  const nhAlgo = normalizeAlgoForNiceHash(algorithm);
  if (!nhAlgo || nhAlgo === 'UNKNOWN') return null;

  const nhAccounts = Object.keys(nhConfigs)
    .filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k));

  let bestPrice = null;
  let bestSource = null;

  for (const acct of nhAccounts) {
    try {
      const { client, clientName } = resolveNhClient(acct);
      if (!client) continue;

      const app = getNiceHashApp(client);

      // Try order book (buy side = what people are willing to pay)
      try {
        const orderBook = await app.hashpower.getOrderBook({ algorithm: nhAlgo, market });
        const buyOrders = orderBook?.buy || orderBook?.data?.buy || [];
        if (Array.isArray(buyOrders) && buyOrders.length > 0) {
          const prices = buyOrders
            .map(o => parseFloat(o.price ?? o.fixedPrice ?? 0))
            .filter(p => p > 0);
          if (prices.length > 0) {
            const maxPrice = Math.max(...prices);
            if (!bestPrice || maxPrice > bestPrice) {
              bestPrice = maxPrice;
              bestSource = `orderbook:${clientName}`;
            }
          }
        }
      } catch {}

      // Also try the calculate endpoint as fallback
      if (!bestPrice) {
        try {
          const calcResult = await app.hashpower.getOrderPrice({ algorithm: nhAlgo, market, amount: '0.01' });
          const calcPrice = parseFloat(calcResult?.price ?? calcResult?.fixedPrice ?? calcResult?.marketPrice ?? 0);
          if (calcPrice > 0 && (!bestPrice || calcPrice > bestPrice)) {
            bestPrice = calcPrice;
            bestSource = `calculate:${clientName}`;
          }
        } catch {}
      }
    } catch {}
  }

  return bestPrice > 0 ? { price: bestPrice, source: bestSource } : null;
}

/**
 * POST /api/v2/hashpower/orders/update-prices
 * Batch update all ACTIVE NiceHash orders to current market prices.
 * Body: { premium: 0.05 } (5% above market, default 0 = at market)
 *       { client: 'VN' } (NH client to use)
 */
export async function registerNiceHashUpdateRatesRoute(app) {
  app.post('/api/v2/hashpower/orders/update-prices', async (req, res) => {
    try {
      const premium = parseFloat(req.body?.premium || 0);
      const clientParam = String(req.body?.client || req.query?.client || 'VN').toUpperCase();
      const nhAccounts = isAggregate(clientParam)
        ? Object.keys(nhConfigs).filter(k => nhConfigs[k].apiKey && nhConfigs[k].apiSecret && nhConfigs[k].orgId && !isAggregate(k))
        : [clientParam];

      const results = [];

      for (const acct of nhAccounts) {
        const { client, clientName } = resolveNhClient(acct);
        if (!client) continue;

        const app = getNiceHashApp(client);

        // Get my orders
        let ordersData;
        try {
          ordersData = await app.hashpower.getMyOrders({ op: 'LE', limit: 100 });
        } catch (e) {
          results.push({ client: clientName, error: `Failed to fetch orders: ${e.message}` });
          continue;
        }

        const rawList = ordersData?.list || ordersData?.myOrders || [];
        const activeOrders = rawList.filter(o => {
          const status = String(o?.status?.code || o?.status || '').toUpperCase();
          return status === 'ACTIVE';
        });

        if (activeOrders.length === 0) {
          results.push({ client: clientName, message: 'No active orders found', orders: [] });
          continue;
        }

        const clientResults = [];

        for (const order of activeOrders) {
          const orderId = order.id || order.orderId;
          const algo = typeof order.algorithm === 'object' ? order.algorithm.algorithm : order.algorithm;
          const market = typeof order.market === 'object' ? order.market.id : (order.market || 'USA');
          const currentPrice = parseFloat(order.price || 0);
          const currentLimit = parseFloat(order.limit || 0);

          // Skip if no limit
          if (!currentLimit || currentLimit <= 0) {
            clientResults.push({ orderId, algorithm: algo, status: 'skipped', reason: 'No limit set' });
            continue;
          }

          // Fetch market price
          const marketInfo = await fetchMarketPrice(algo, market);
          if (!marketInfo || !marketInfo.price || marketInfo.price <= 0) {
            clientResults.push({ orderId, algorithm: algo, status: 'skipped', reason: 'No market price available' });
            continue;
          }

          // Apply premium
          const newPrice = marketInfo.price * (1 + premium);

          // Only update if price changed by more than 1%
          const pctChange = Math.abs((newPrice - currentPrice) / currentPrice) * 100;
          if (pctChange < 1 && currentPrice > 0) {
            clientResults.push({ orderId, algorithm: algo, status: 'skipped', reason: `Price within 1% (${pctChange.toFixed(2)}%)` });
            continue;
          }

          // Get algorithm info for market factor
          let marketFactor = '1000000000000';
          let displayMarketFactor = 'TH';
          try {
            const algos = await app.public.getAlgorithms();
            const algoList = algos?.miningAlgorithms || [];
            const match = algoList.find(a => a.algorithm?.toUpperCase() === algo.toUpperCase());
            if (match) {
              marketFactor = match.marketFactor || match.displayMarketFactor || marketFactor;
              displayMarketFactor = match.displayMarketFactor || displayMarketFactor;
            }
          } catch {}

          // Update the order
          try {
            const updateResult = await app.hashpower.updatePriceLimit(orderId, {
              price: String(newPrice),
              limit: String(currentLimit),
              marketFactor,
              displayMarketFactor,
            });

            clientResults.push({
              orderId,
              algorithm: algo,
              status: 'updated',
              oldPrice: currentPrice,
              newPrice,
              limit: currentLimit,
              pctChange: pctChange.toFixed(2),
              marketSource: marketInfo.source,
            });
          } catch (e) {
            clientResults.push({ orderId, algorithm: algo, status: 'error', error: e.message });
          }
        }

        results.push({ client: clientName, orders: clientResults });
      }

      const totalUpdated = results.reduce((sum, r) => sum + (r.orders || []).filter(o => o.status === 'updated').length, 0);
      const totalSkipped = results.reduce((sum, r) => sum + (r.orders || []).filter(o => o.status === 'skipped').length, 0);
      const totalErrors = results.reduce((sum, r) => sum + (r.orders || []).filter(o => o.status === 'error').length, 0);

      res.json({
        success: true,
        premium,
        summary: { updated: totalUpdated, skipped: totalSkipped, errors: totalErrors },
        results,
        timestamp: new Date().toISOString(),
      });

    } catch (error) {
      console.error('[NH Batch Update Prices Error]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
